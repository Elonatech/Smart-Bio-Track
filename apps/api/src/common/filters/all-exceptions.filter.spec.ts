import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter, ErrorEnvelope } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    // The filter logs every error; silence it so test output stays readable.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/api/auth/login' }),
      }),
    } as unknown as ArgumentsHost;

    filter = new AllExceptionsFilter();
  });

  const captured = (): ErrorEnvelope => json.mock.calls[0][0] as ErrorEnvelope;

  it('emits the error envelope for a simple HttpException', () => {
    filter.catch(new UnauthorizedException('Invalid credentials'), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(captured()).toEqual({
      success: false,
      message: 'Invalid credentials',
      error: { code: 'UNAUTHORIZED', details: [] },
    });
  });

  it('flattens a class-validator array into message + details', () => {
    filter.catch(
      new BadRequestException([
        'Email is required',
        'Password must be at least 8 characters long',
      ]),
      host,
    );

    const body = captured();
    expect(body.message).toBe('Email is required');
    expect(body.error.details).toEqual([
      'Email is required',
      'Password must be at least 8 characters long',
    ]);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('never nests the message — it is always a plain string', () => {
    filter.catch(new ForbiddenException('Nope'), host);

    expect(typeof captured().message).toBe('string');
  });

  it('maps status codes to stable client-facing codes', () => {
    filter.catch(new NotFoundException('Department not found'), host);

    expect(captured().error.code).toBe('NOT_FOUND');
  });

  it('does not leak internals for an unexpected error', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = captured();
    expect(body.message).toBe('Internal server error');
    expect(body.message).not.toContain('ECONNREFUSED');
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
