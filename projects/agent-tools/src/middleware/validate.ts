import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from './error-handler';

/**
 * Middleware factory that validates request body against a Joi schema
 * @param schema - Joi schema to validate against
 * @returns Express middleware function
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Collect all validation errors, not just the first
      stripUnknown: true  // Remove unknown fields from validated data
    });

    if (error) {
      // Extract all validation error messages
      const messages = error.details.map(detail => detail.message);
      return next(new ValidationError(messages.join('; ')));
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};
