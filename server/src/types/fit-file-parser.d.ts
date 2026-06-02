declare module "fit-file-parser" {
  interface FitParserOptions {
    force?: boolean;
    speedUnit?: "km/h" | "mph" | "m/s";
    lengthUnit?: "km" | "mi" | "m";
    temperatureUnit?: "celcius" | "kelvin" | "fahrenheit";
    elapsedRecordField?: boolean;
    mode?: "cascade" | "list" | "both";
  }
  export default class FitParser {
    constructor(options?: FitParserOptions);
    parse(content: Buffer | ArrayBuffer, callback: (error: string | null, data: any) => void): void;
  }
}
