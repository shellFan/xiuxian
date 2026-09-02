/**
 * Schema Validator — Validates task/developer/reviewer JSON against schemas.
 */
import fs from 'fs';
import path from 'path';
import { dirs } from './config';

interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a task object against task.schema.json.
 */
export function validateTask(task: Record<string, unknown>): SchemaValidationResult {
  return validateAgainstSchema(task, 'task.schema.json');
}

/**
 * Validate a developer result against developer.schema.json.
 */
export function validateDeveloperResult(result: Record<string, unknown>): SchemaValidationResult {
  return validateAgainstSchema(result, 'developer.schema.json');
}

/** Alias for validateDeveloperResult — used by result-parser and review-runner */
export const validateDeveloper = validateDeveloperResult;

/**
 * Validate a review result against reviewer.schema.json.
 */
export function validateReviewResult(review: Record<string, unknown>): SchemaValidationResult {
  return validateAgainstSchema(review, 'reviewer.schema.json');
}

/** Alias for validateReviewResult — used by result-parser and review-runner */
export const validateReview = validateReviewResult;

/**
 * Generic JSON schema validation.
 * Uses a simple structural validator (no external deps).
 * For production, consider ajv or similar.
 */
function validateAgainstSchema(data: Record<string, unknown>, schemaFile: string): SchemaValidationResult {
  const schemaPath = path.join(dirs.schemas, schemaFile);
  if (!fs.existsSync(schemaPath)) {
    return { valid: true, errors: [] }; // Skip if schema missing
  }

  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const errors: string[] = [];

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (data[field] === undefined || data[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check types for properties
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (data[key] === undefined) continue; // Optional field
        const propDef = prop as { type?: string; enum?: unknown[]; items?: { type?: string } };
        if (propDef.type) {
          const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
          const expectedType = propDef.type;
          if (actualType !== expectedType) {
            errors.push(`Field '${key}' should be ${expectedType}, got ${actualType}`);
          }
        }
        if (propDef.enum && !propDef.enum.includes(data[key])) {
          errors.push(`Field '${key}' value '${data[key]}' not in enum: ${propDef.enum.join(', ')}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  } catch (e) {
    return { valid: false, errors: [`Schema parse error: ${e}`] };
  }
}