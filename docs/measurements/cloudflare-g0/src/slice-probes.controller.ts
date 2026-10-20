import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import { Public } from '../../../../apps/api/src/app/auth/public.decorator';

// Probe routes are public: they measure the runtime, not the auth pipeline.
@Public()
@Controller('g0')
export class SliceProbesController {
  constructor(@Inject(ConfigService) private readonly cfg: ConfigService) {}

  @Get('presign')
  async presign() {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
      credentials: { accessKeyId: 'g0', secretAccessKey: 'g0-secret' },
    });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: 'g0', Key: 'probe.txt' }), {
      expiresIn: 60,
    });
    return {
      hasExpires: url.includes('X-Amz-Expires=60'),
      host: new URL(url).host.split('.').slice(-3).join('.'),
    };
  }

  @Get('supabase')
  supabase() {
    const client = createClient('https://example.supabase.co', 'g0-anon-key');
    return { client: typeof client.auth.signInWithPassword === 'function' };
  }

  @Get('env')
  env() {
    return { populated: this.cfg.get<string>('G0_PROBE') === 'g0-env-ok' };
  }
}
