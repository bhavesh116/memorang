import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../../types/learning';

/**
 * Extracts the verified user from the request (set by SupabaseAuthGuard).
 *
 * Usage: @CurrentUser() user: AuthUser
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
