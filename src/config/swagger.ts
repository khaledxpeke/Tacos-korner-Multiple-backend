import type { Application, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { paths } from "./paths";

interface SwaggerParam {
  $ref?: string;
  [key: string]: unknown;
}

interface SwaggerDoc {
  components?: { parameters?: Record<string, SwaggerParam> };
  paths?: Record<string, Record<string, { parameters?: SwaggerParam[] }>>;
}

function resolveParameterRefs(doc: SwaggerDoc): SwaggerDoc {
  const componentParams = doc.components?.parameters || {};

  const resolveList = (parameters?: SwaggerParam[]) =>
    (parameters || []).map((param) => {
      if (param?.$ref) {
        const key = param.$ref.replace("#/components/parameters/", "");
        const resolved = componentParams[key];
        if (!resolved) {
          throw new Error(`Unresolved swagger parameter ref: ${param.$ref}`);
        }
        return JSON.parse(JSON.stringify(resolved)) as SwaggerParam;
      }
      return param;
    });

  for (const pathItem of Object.values(doc.paths || {})) {
    for (const operation of Object.values(pathItem)) {
      if (operation && typeof operation === "object" && operation.parameters) {
        operation.parameters = resolveList(operation.parameters);
      }
    }
  }

  return doc;
}

const rawDocument = YAML.load(paths.swagger) as SwaggerDoc;
export const swaggerDocument = resolveParameterRefs(rawDocument);

const swaggerOptions = {
  customSiteTitle: "LayaFood API Docs",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  },
};

export const setupSwagger = (app: Application): void => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));
  app.get("/api-docs.json", (_req: Request, res: Response) => {
    res.json(swaggerDocument);
  });
};
