"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const todos_1 = __importDefault(require("./routes/todos"));
const swagger_1 = require("./swagger");
const database_1 = require("./db/database");
const error_handler_1 = require("./middleware/error-handler");
const request_logger_1 = require("./middleware/request-logger");
const cors_config_1 = require("./middleware/cors-config");
const security_headers_1 = require("./middleware/security-headers");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Initialize database
(0, database_1.initializeDatabase)();
// Security headers middleware - must be first for all responses
app.use(security_headers_1.securityHeaders);
// Request logging middleware - must be before other middleware
app.use(request_logger_1.requestLogger);
// CORS middleware - must be before routes and body parsers
app.use(cors_config_1.corsMiddleware);
app.use(express_1.default.json());
// Swagger documentation
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime()
    });
});
// Mount TODO routes
app.use('/todos', todos_1.default);
// Error handler must be registered last
app.use(error_handler_1.errorHandler);
if (require.main === module) {
    app.listen(PORT, () => {
        logger_1.logger.info(`Server running on port ${PORT}`);
    });
}
exports.default = app;
//# sourceMappingURL=index.js.map