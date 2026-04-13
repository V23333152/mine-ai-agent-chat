/**
 * JSON Schema to Zod Schema Converter
 * 
 * Converts MCP tool input schemas (JSON Schema) to Zod schemas
 * for use with LangChain tools.
 */

import { z, ZodTypeAny } from "zod";

/**
 * Convert a JSON schema to a Zod schema
 */
export function jsonSchemaToZod(schema: any): z.ZodObject<any> {
  if (!schema || typeof schema !== "object") {
    return z.object({});
  }

  // Handle object type
  if (schema.type === "object" || schema.properties) {
    const shape: Record<string, ZodTypeAny> = {};
    const properties = schema.properties || {};
    const required = schema.required || [];

    for (const [key, propSchema] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      shape[key] = convertProperty(propSchema as any, isRequired);
    }

    return z.object(shape);
  }

  // Default to empty object
  return z.object({});
}

/**
 * Convert a single property schema to Zod
 */
function convertProperty(schema: any, isRequired: boolean): ZodTypeAny {
  if (!schema || typeof schema !== "object") {
    return isRequired ? z.any() : z.any().optional();
  }

  let zodType: ZodTypeAny;

  // Handle different types
  switch (schema.type) {
    case "string":
      zodType = z.string();
      
      // Handle enum
      if (schema.enum && Array.isArray(schema.enum)) {
        zodType = z.enum(schema.enum as [string, ...string[]]);
      }
      
      // Handle format
      if (schema.format === "email") {
        zodType = z.string().email();
      } else if (schema.format === "uri" || schema.format === "url") {
        zodType = z.string().url();
      } else if (schema.format === "uuid") {
        zodType = z.string().uuid();
      } else if (schema.format === "date-time") {
        zodType = z.string().datetime();
      }
      
      // Handle min/max length
      if (schema.minLength !== undefined) {
        zodType = (zodType as z.ZodString).min(schema.minLength);
      }
      if (schema.maxLength !== undefined) {
        zodType = (zodType as z.ZodString).max(schema.maxLength);
      }
      
      // Handle pattern
      if (schema.pattern) {
        zodType = (zodType as z.ZodString).regex(new RegExp(schema.pattern));
      }
      break;

    case "number":
      zodType = z.number();
      
      if (schema.minimum !== undefined) {
        zodType = (zodType as z.ZodNumber).min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        zodType = (zodType as z.ZodNumber).max(schema.maximum);
      }
      if (schema.exclusiveMinimum !== undefined) {
        zodType = (zodType as z.ZodNumber).gt(schema.exclusiveMinimum);
      }
      if (schema.exclusiveMaximum !== undefined) {
        zodType = (zodType as z.ZodNumber).lt(schema.exclusiveMaximum);
      }
      break;

    case "integer":
      zodType = z.number().int();
      
      if (schema.minimum !== undefined) {
        zodType = (zodType as z.ZodNumber).min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        zodType = (zodType as z.ZodNumber).max(schema.maximum);
      }
      break;

    case "boolean":
      zodType = z.boolean();
      break;

    case "array":
      if (schema.items) {
        const itemType = convertProperty(schema.items, true);
        zodType = z.array(itemType);
      } else {
        zodType = z.array(z.any());
      }
      
      if (schema.minItems !== undefined) {
        zodType = (zodType as z.ZodArray<any>).min(schema.minItems);
      }
      if (schema.maxItems !== undefined) {
        zodType = (zodType as z.ZodArray<any>).max(schema.maxItems);
      }
      break;

    case "object":
      if (schema.properties) {
        zodType = jsonSchemaToZod(schema);
      } else {
        zodType = z.record(z.any());
      }
      break;

    case "null":
      zodType = z.null();
      break;

    default:
      // Handle anyOf, oneOf, allOf
      if (schema.anyOf || schema.oneOf) {
        const schemas = (schema.anyOf || schema.oneOf) as any[];
        if (schemas.length > 0) {
          // Use the first schema as primary
          zodType = convertProperty(schemas[0], isRequired);
        } else {
          zodType = z.any();
        }
      } else {
        zodType = z.any();
      }
  }

  // Handle description
  if (schema.description && zodType instanceof z.ZodType) {
    zodType = zodType.describe(schema.description);
  }

  // Handle default value - fields with defaults are effectively optional
  if (schema.default !== undefined) {
    zodType = zodType.default(schema.default);
    // For required strings with minLength, don't add nullish to preserve validation
    if (!isRequired || schema.type !== 'string' || schema.minLength === undefined) {
      zodType = zodType.nullish();
    }
  } else if (!isRequired) {
    // Non-required fields without defaults are nullish
    zodType = zodType.nullish();
  }
  // Note: isRequired fields (especially strings with minLength) stay strictly validated

  return zodType;
}

/**
 * Get a description from JSON schema
 */
export function getSchemaDescription(schema: any): string | undefined {
  return schema?.description;
}
