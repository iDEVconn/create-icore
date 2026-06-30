import { runAuthContract } from '@icore/shared/testing';
import { createMockPostgresAuth } from '../testing/mock-postgres-auth.js';

runAuthContract('PostgresAuthStrategy', () => createMockPostgresAuth());
