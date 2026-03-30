import Joi from 'joi';

/**
 * Validation schema for creating a new TODO
 * - title: required, string, 1-200 characters
 * - description: optional, string, max 1000 characters
 * - completed: optional, boolean (though typically not used on create)
 */
export const createTodoSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .trim()
    .required()
    .messages({
      'string.base': 'Title must be a string',
      'string.empty': 'Title cannot be empty',
      'string.min': 'Title must be at least 1 character',
      'string.max': 'Title cannot exceed 200 characters',
      'any.required': 'Title is required'
    }),
  description: Joi.string()
    .max(1000)
    .trim()
    .allow('')
    .optional()
    .messages({
      'string.base': 'Description must be a string',
      'string.max': 'Description cannot exceed 1000 characters'
    }),
  completed: Joi.boolean()
    .strict()
    .optional()
    .messages({
      'boolean.base': 'Completed must be a boolean'
    })
}).options({ stripUnknown: true });

/**
 * Validation schema for updating an existing TODO
 * - All fields are optional
 * - At least one field must be provided
 * - title: string, 1-200 characters if provided
 * - description: string, max 1000 characters if provided
 * - completed: boolean if provided
 */
export const updateTodoSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .trim()
    .optional()
    .messages({
      'string.base': 'Title must be a string',
      'string.empty': 'Title cannot be empty',
      'string.min': 'Title must be at least 1 character',
      'string.max': 'Title cannot exceed 200 characters'
    }),
  description: Joi.string()
    .max(1000)
    .trim()
    .allow('')
    .optional()
    .messages({
      'string.base': 'Description must be a string',
      'string.max': 'Description cannot exceed 1000 characters'
    }),
  completed: Joi.boolean()
    .strict()
    .optional()
    .messages({
      'boolean.base': 'Completed must be a boolean'
    })
})
  .min(1)
  .options({ stripUnknown: true })
  .messages({
    'object.min': 'At least one field must be provided for update'
  });
