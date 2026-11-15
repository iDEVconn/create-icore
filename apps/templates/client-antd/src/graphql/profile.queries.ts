import profileDocument from './gql/profile.graphql';
import { operation } from './operation';
import type {
  GetMeQuery,
  GetMeQueryVariables,
  UpdateProfileMutation,
  UpdateProfileMutationVariables,
} from '../gql/types';

export const GetMe = operation<GetMeQuery, GetMeQueryVariables>(profileDocument, 'GetMe');
export const UpdateProfile = operation<UpdateProfileMutation, UpdateProfileMutationVariables>(
  profileDocument,
  'UpdateProfile',
);
