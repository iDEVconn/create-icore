import { UnauthorizedException } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UploadClientService } from '@icore/upload-client';
import type { StorageRef, VerifiedToken } from '@icore/shared';
import { CurrentUser } from '../../http/current-user.decorator';
import { assertOwnership, assertSafeListPrefix } from '../assert-ownership';
import { StorageRefModel } from './storage.model';

// The global AuthGuard has already rejected anonymous callers; this keeps a missing user a 401.
function uidOf(user: VerifiedToken | undefined): string {
  if (!user) throw new UnauthorizedException();
  return user.uid;
}

/**
 * GraphQL surface of storage: list, signed URL and remove. Upload and download stay REST
 * (multipart / binary). Ownership is the same assertOwnership the REST controller uses.
 */
@Resolver(() => StorageRefModel)
export class StorageResolver {
  constructor(private readonly uploadClient: UploadClientService) {}

  @Query(() => [StorageRefModel], { description: "List the caller's stored files" })
  async files(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('prefix', { type: () => String, nullable: true }) prefix: string | undefined,
  ): Promise<StorageRef[]> {
    assertSafeListPrefix(prefix);
    return this.uploadClient.list(uidOf(user), prefix ?? undefined);
  }

  @Query(() => String, { description: 'Sign a StorageRef for short-lived download' })
  async signedUrl(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('bucket', { type: () => String }) bucket: string,
    @Args('path', { type: () => String }) path: string,
    @Args('ttlSec', { type: () => Int, nullable: true }) ttlSec: number | undefined,
  ): Promise<string> {
    const uid = uidOf(user);
    const ref: StorageRef = { bucket, path };
    assertOwnership(ref, uid);
    return this.uploadClient.signedUrl(uid, ref, ttlSec ?? undefined);
  }

  @Mutation(() => Boolean, { description: 'Delete a file the caller owns' })
  async removeFile(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('bucket', { type: () => String }) bucket: string,
    @Args('path', { type: () => String }) path: string,
  ): Promise<boolean> {
    const uid = uidOf(user);
    const ref: StorageRef = { bucket, path };
    assertOwnership(ref, uid);
    await this.uploadClient.remove(uid, ref);
    return true;
  }
}
