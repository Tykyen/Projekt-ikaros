import { ResponseInterceptor } from './response.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('ResponseInterceptor', () => {
  it('should wrap response in { data }', (done) => {
    const interceptor = new ResponseInterceptor();
    const mockContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = { handle: () => of({ id: '1' }) };

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result).toEqual({ data: { id: '1' } });
      done();
    });
  });
});
