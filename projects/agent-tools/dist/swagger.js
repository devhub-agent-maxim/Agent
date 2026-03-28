"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Agent Tools API',
            version: '0.1.0',
            description: 'TypeScript + Express API for productivity tools',
            contact: {
                name: 'API Support',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server',
            },
        ],
        components: {
            schemas: {
                Todo: {
                    type: 'object',
                    required: ['id', 'title', 'completed', 'createdAt'],
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Unique identifier for the todo',
                            example: 'todo-1',
                        },
                        title: {
                            type: 'string',
                            description: 'The title of the todo',
                            minLength: 1,
                            maxLength: 200,
                            example: 'Complete project documentation',
                        },
                        description: {
                            type: 'string',
                            description: 'Optional detailed description of the todo',
                            maxLength: 1000,
                            example: 'Write comprehensive API documentation with examples',
                        },
                        completed: {
                            type: 'boolean',
                            description: 'Whether the todo is completed',
                            example: false,
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Timestamp when the todo was created',
                            example: '2026-03-29T01:00:00.000Z',
                        },
                    },
                },
                CreateTodoInput: {
                    type: 'object',
                    required: ['title'],
                    properties: {
                        title: {
                            type: 'string',
                            description: 'The title of the todo',
                            minLength: 1,
                            maxLength: 200,
                            example: 'Complete project documentation',
                        },
                        description: {
                            type: 'string',
                            description: 'Optional detailed description of the todo',
                            maxLength: 1000,
                            example: 'Write comprehensive API documentation with examples',
                        },
                    },
                },
                UpdateTodoInput: {
                    type: 'object',
                    minProperties: 1,
                    properties: {
                        title: {
                            type: 'string',
                            description: 'The title of the todo',
                            minLength: 1,
                            maxLength: 200,
                            example: 'Updated todo title',
                        },
                        description: {
                            type: 'string',
                            description: 'Optional detailed description of the todo',
                            maxLength: 1000,
                            example: 'Updated description',
                        },
                        completed: {
                            type: 'boolean',
                            description: 'Whether the todo is completed',
                            example: true,
                        },
                    },
                },
                Error: {
                    type: 'object',
                    required: ['error'],
                    properties: {
                        error: {
                            type: 'string',
                            description: 'Error message',
                            example: 'Todo not found',
                        },
                    },
                },
                Health: {
                    type: 'object',
                    required: ['status', 'uptime'],
                    properties: {
                        status: {
                            type: 'string',
                            description: 'Health status of the API',
                            example: 'ok',
                        },
                        uptime: {
                            type: 'number',
                            description: 'Server uptime in seconds',
                            example: 123.456,
                        },
                    },
                },
            },
        },
        paths: {
            '/health': {
                get: {
                    summary: 'Health check endpoint',
                    description: 'Returns the health status of the API',
                    tags: ['Health'],
                    responses: {
                        '200': {
                            description: 'API is healthy',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Health',
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/todos': {
                get: {
                    summary: 'Get all todos',
                    description: 'Returns a list of all todos',
                    tags: ['Todos'],
                    responses: {
                        '200': {
                            description: 'List of todos',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: {
                                            $ref: '#/components/schemas/Todo',
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                post: {
                    summary: 'Create a new todo',
                    description: 'Creates a new todo with the provided data',
                    tags: ['Todos'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/CreateTodoInput',
                                },
                            },
                        },
                    },
                    responses: {
                        '201': {
                            description: 'Todo created successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Todo',
                                    },
                                },
                            },
                        },
                        '400': {
                            description: 'Invalid input',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Error',
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/todos/{id}': {
                get: {
                    summary: 'Get a todo by ID',
                    description: 'Returns a single todo by its ID',
                    tags: ['Todos'],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            description: 'ID of the todo to retrieve',
                            schema: {
                                type: 'string',
                                example: 'todo-1',
                            },
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'Todo found',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Todo',
                                    },
                                },
                            },
                        },
                        '404': {
                            description: 'Todo not found',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Error',
                                    },
                                },
                            },
                        },
                    },
                },
                put: {
                    summary: 'Update a todo',
                    description: 'Updates an existing todo with the provided data',
                    tags: ['Todos'],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            description: 'ID of the todo to update',
                            schema: {
                                type: 'string',
                                example: 'todo-1',
                            },
                        },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/UpdateTodoInput',
                                },
                            },
                        },
                    },
                    responses: {
                        '200': {
                            description: 'Todo updated successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Todo',
                                    },
                                },
                            },
                        },
                        '400': {
                            description: 'Invalid input',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Error',
                                    },
                                },
                            },
                        },
                        '404': {
                            description: 'Todo not found',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Error',
                                    },
                                },
                            },
                        },
                    },
                },
                delete: {
                    summary: 'Delete a todo',
                    description: 'Deletes a todo by its ID',
                    tags: ['Todos'],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            description: 'ID of the todo to delete',
                            schema: {
                                type: 'string',
                                example: 'todo-1',
                            },
                        },
                    ],
                    responses: {
                        '204': {
                            description: 'Todo deleted successfully',
                        },
                        '404': {
                            description: 'Todo not found',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Error',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    apis: [],
};
exports.swaggerSpec = (0, swagger_jsdoc_1.default)(options);
//# sourceMappingURL=swagger.js.map