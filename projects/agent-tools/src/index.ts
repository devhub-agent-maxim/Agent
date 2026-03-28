import express, { Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import todosRouter from './routes/todos';
import { swaggerSpec } from './swagger';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime()
  });
});

// Mount TODO routes
app.use('/todos', todosRouter);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
