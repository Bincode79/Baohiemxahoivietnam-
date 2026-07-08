declare module "swagger-jsdoc" {
  interface Options {
    definition?: Record<string, unknown>;
    apis?: string[];
    [key: string]: unknown;
  }
  function swaggerJsdoc(options: Options): object;
  export = swaggerJsdoc;
}
