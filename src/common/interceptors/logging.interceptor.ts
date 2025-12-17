import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LogsService } from '../../logs/logs.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly logsService: LogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query, headers } = request;
    const startTime = Date.now();

    this.logger.log(`Incoming Request: ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          const duration = Date.now() - startTime;

          this.logsService
            .create({
              service: 'api',
              action: `${method} ${url}`,
              status: 'success',
              request: {
                method,
                url,
                body,
                query,
              },
              response: responseData,
              metadata: {
                userAgent: headers['user-agent'],
                ip: request.ip,
              },
              duration,
            })
            .catch((error) => {
              this.logger.error(
                `Failed to log request: ${error.message}`,
              );
            });

          this.logger.log(
            `Response: ${method} ${url} - ${duration}ms`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;

          this.logsService
            .create({
              service: 'api',
              action: `${method} ${url}`,
              status: 'error',
              request: {
                method,
                url,
                body,
                query,
              },
              errorMessage: error.message,
              metadata: {
                userAgent: headers['user-agent'],
                ip: request.ip,
                stack: error.stack,
              },
              duration,
            })
            .catch((logError) => {
              this.logger.error(
                `Failed to log error: ${logError.message}`,
              );
            });

          this.logger.error(
            `Error: ${method} ${url} - ${error.message} - ${duration}ms`,
          );
        },
      }),
    );
  }
}
