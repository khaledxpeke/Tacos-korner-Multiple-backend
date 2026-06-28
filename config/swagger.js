const path = require("path");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

function resolveParameterRefs(doc) {
  const componentParams = doc.components?.parameters || {};

  const resolveList = (parameters) =>
    (parameters || []).map((param) => {
      if (param?.$ref) {
        const key = param.$ref.replace("#/components/parameters/", "");
        const resolved = componentParams[key];
        if (!resolved) {
          throw new Error(`Unresolved swagger parameter ref: ${param.$ref}`);
        }
        return JSON.parse(JSON.stringify(resolved));
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

const rawDocument = YAML.load(
  path.join(__dirname, "..", "swagger", "openapi.yaml")
);
const swaggerDocument = resolveParameterRefs(rawDocument);

const swaggerOptions = {
  customSiteTitle: "LayaFood API Docs",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  },
};

const setupSwagger = (app) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, swaggerOptions)
  );
  app.get("/api-docs.json", (_req, res) => {
    res.json(swaggerDocument);
  });
};

module.exports = { setupSwagger, swaggerDocument };
