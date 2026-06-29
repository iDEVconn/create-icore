import { runDBContract } from '@icore/shared/testing';
import { createMockPostgresDB } from '../testing/mock-postgres.js';

runDBContract('PostgresDBStrategy', () => createMockPostgresDB());
