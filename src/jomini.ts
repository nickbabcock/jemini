import init, {
  parse_text,
  Query as WasmQuery,
  WasmWriter,
  write_text,
} from "./pkg/jomini_js";
import jomini_wasm from "./pkg/jomini_js_bg.wasm";

/**
 * Supported encodings: UTF8 and Windows1252
 */
export type Encoding = "utf8" | "windows1252";

/**
 * Tweaks the knobs used in parsing
 */
export type ParseOptions = {
  /**
   * The encoding used to transform bytes to strings
   */
  encoding: Encoding;
};

const encoder = new TextEncoder();
let initialized = false;
export class Jomini {
  private constructor() {}

  /**
   * Parses plain text data into javascript values
   *
   * @param data The data to parse, can either be raw bytes or a string. If given a string, the
   * string will be encoded as utf-8. Else if given bytes, they are assumed to be utf-8 unless the
   * windows1252 is passed as the encoding.
   * @param options Controls the encoding of the data. If not configured, assumes utf-8
   * @param cb The callback to extract a subset of the parsed document. Since creating JS objects
   * is where 95-99% of the performance is lost, one can achieve a great speedup by requesting only
   * the bits needed. If a callback is not provided, then the entire parsed document is returned.
   */
  public parseText<T>(
    data: Uint8Array | string,
    options?: Partial<ParseOptions>,
    cb?: (arg0: Query) => T
  ) {
    if (typeof data === "string") {
      var inp = encoder.encode(data);
      options = { ...options, ...{ encoding: "utf8" } };
    } else {
      var inp = data;
    }

    const innerQuery = parse_text(inp, options?.encoding ?? "utf8");
    const query = new Query(innerQuery);

    if (cb === undefined) {
      const val = query.root();
      innerQuery.free();
      return val;
    } else {
      const val = cb(query);
      innerQuery.free();
      return val;
    }
  }

  public write(cb: (arg0: Writer) => void): Uint8Array {
    let inner = write_text();
    let writer = new Writer(inner);
    cb(writer);
    return inner.inner();
  }

  /**
   * Initializes a jomini parser. There is a one time global setup fee (sub 30ms), but subsequent
   * requests to initialize will be instantaneous, so it's not imperative to reuse the same parser.
   */
  public static initialize = async () => {
    if (!initialized) {
      //@ts-ignore
      await init(jomini_wasm());
      initialized = true;
    }

    return new Jomini();
  };
}

/**
 * Tweaks the knobs used in JSON generation
 */
export type JsonOptions = {
  /**
   * If the JSON should be pretty-printed. Defaults to false
   */
  pretty: boolean;

  /**
   * Determines how duplicate keys are disambiguated from arrays. The default of
   * "none" means that there is no disambiguation and that duplicate keys will
   * be aggregated into an array and appear similar to other arrays. "keys" will
   * write duplicate keys back into the JSON but it is debateable whether duplicate
   * keys is considered valid JSON. "typed" is an overly verbose format that translates
   * objects into arrays of key value tuples -- arrays are also transformed in this
   * process to explicitly list their type as `array`
   */
  disambiguate: "none" | "keys" | "typed";
};

export class Query {
  constructor(private query: WasmQuery) {}

  /** Convert the entire document into an object */
  root(): Object {
    return this.query.root();
  }

  /**
   * Narrow down the document to just the specified property
   *
   * @param pointer the JSON pointer-esque string to the desired value
   * @returns object, array, or value identified by the query
   */
  at(pointer: string): any {
    return this.query.at(pointer);
  }

  /** Convert the entire document into a JSON string */
  json(options?: Partial<JsonOptions>): string {
    return this.query.json(
      options?.pretty || false,
      options?.disambiguate || "none"
    );
  }
}

/**
 * A text writer that accumulates commands written to an internal buffer
 */
export class Writer {
  constructor(private writer: WasmWriter) {}

  /**
   * Write out the start of an object
   */
  write_object_start() {
    this.writer.write_object_start();
  }

  /**
   * Write out the start of a hidden object
   */
   write_hidden_object_start() {
    this.writer.write_hidden_object_start();
  }

  /**
   * Write out the start of an array
   */
  write_array_start() {
    this.writer.write_array_start();
  }

  /**
   * End the outermost object or array
   */
  write_end() {
    this.writer.write_end();
  }

  /**
   * Write out a yes or no
   * @param data boolean to be written
   */
  write_bool(data: boolean) {
    this.writer.write_bool(data);
  }

  /**
   * Write out a non-equals operator
   * @param data operator to write out
   */
  write_operator(data: ">" | ">=" | "<" | "<=") {
    this.writer.write_operator(data);
  }

  /**
   * Write unquoted data. Most, if not all object keys should be unquoted.
   * @param data unquoted data to write
   */
  write_unquoted(data: Uint8Array | string) {
    if (typeof data === "string") {
      this.writer.write_unquoted(encoder.encode(data));
    } else {
      this.writer.write_unquoted(data);
    }
  }

  /**
   * Write a field to be encapsulated in quotes. Unlike the unquoted variant,
   * this method will inspect the data to ensure everything is properly
   * escaped, like quotes and escape characters. And will trim trailing
   * newlines. Strings that are passed in are assumed to be UTF-8, so if
   * you're wanting to write out EU4 data you'll want to first convert the
   * payload to a windows 1252 byte array.
   * @param data payload to be quoted
   */
  write_quoted(data: Uint8Array | string) {
    if (typeof data === "string") {
      this.writer.write_quoted(encoder.encode(data));
    } else {
      this.writer.write_quoted(data);
    }
  }

  /**
   * Write a header object like (rgb, hsv, LIST, etc). One will need to start an array
   * or object after calling this method
   * @param data the header
   */
  write_header(data: Uint8Array | string) {
    if (typeof data === "string") {
      this.writer.write_header(encoder.encode(data));
    } else {
      this.writer.write_header(data);
    }
  }

  /**
   * Write a signed number
   * @param data signed payload
   */
  write_integer(data: number) {
    this.writer.write_integer(data);
  }

  /**
   * Write an unsigned big number
   * @param data big number
   */
  write_u64(data: bigint) {
    this.writer.write_u64(data);
  }

  /**
   * Write a 32 bit floating point number
   * @param data 32 bit floating point
   */
  write_f32(data: number) {
    this.writer.write_f32(data);
  }

  /**
   * Write a 64 bit floating point number
   * @param data 64 bit floating point
   */
  write_f64(data: number) {
    this.writer.write_f64(data);
  }

  /**
   * Write a date
   * @param date date
   */
  write_date(date: Date, options?: Partial<{hour: boolean}>,) {
    this.writer.write_date(date, options?.hour || false);
  }
}
