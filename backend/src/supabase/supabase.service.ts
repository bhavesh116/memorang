import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthUser } from '../types/learning';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private _client!: SupabaseClient;

  onModuleInit() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.',
      );
    }

    this._client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    this.logger.log('Supabase admin client initialized');
  }

  /** Admin client — bypasses RLS. Use only server-side. */
  get client(): SupabaseClient {
    return this._client;
  }

  /**
   * Verify a user's Supabase access token.
   * @throws if the token is invalid or expired
   */
  async verifyToken(token: string): Promise<AuthUser> {
    const { data, error } = await this._client.auth.getUser(token);
    if (error || !data.user) {
      throw new Error('Invalid or expired token');
    }
    return { id: data.user.id, email: data.user.email };
  }
}
