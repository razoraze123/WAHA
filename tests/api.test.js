const request = require('supertest');
const express = require('express');
const routes = require('../src/routes');

const app = express();
app.use(express.json());
app.use('/api', routes);

describe('API Endpoints', () => {
  it('should return { status: \'ok\' } for GET /api/status', async () => {
    const res = await request(app).get('/api/status');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('should return a success message for POST /api/webhook', async () => {
    const payload = { test: 'data' };
    const res = await request(app)
      .post('/api/webhook')
      .send(payload);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ message: 'Webhook received successfully', data: payload });
  });
});
