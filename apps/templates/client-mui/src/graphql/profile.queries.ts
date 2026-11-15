import profileDocument from './gql/profile.graphql';
import { operation } from './operation';
import type { GetMeQuery, GetMeQueryVariables } from '../gql/types';

export const GetMe = operation<GetMeQuery, GetMeQueryVariables>(profileDocument, 'GetMe');
