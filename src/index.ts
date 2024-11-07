import { Hono } from 'hono';
import { handleApiRoute } from './routes/api';

const app = new Hono();

// Definicja prostego endpointu testowego
app.get('/', (c) => c.text('Hello from Cloudflare Workers!'));

// Definicja endpointu `/api`
app.get('/api', handleApiRoute);

export default app;
