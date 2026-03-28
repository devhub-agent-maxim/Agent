import express, { Request, Response } from 'express';
import todosRouter from './routes/todos';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
