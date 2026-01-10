import { CreateNewUserData, CreateNewUserVariables, GetUserByIdData, GetUserByIdVariables, ListUsersByProximityData, ListUsersByProximityVariables, AddUserInterestData, AddUserInterestVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateNewUser(options?: useDataConnectMutationOptions<CreateNewUserData, FirebaseError, CreateNewUserVariables>): UseDataConnectMutationResult<CreateNewUserData, CreateNewUserVariables>;
export function useCreateNewUser(dc: DataConnect, options?: useDataConnectMutationOptions<CreateNewUserData, FirebaseError, CreateNewUserVariables>): UseDataConnectMutationResult<CreateNewUserData, CreateNewUserVariables>;

export function useGetUserById(vars: GetUserByIdVariables, options?: useDataConnectQueryOptions<GetUserByIdData>): UseDataConnectQueryResult<GetUserByIdData, GetUserByIdVariables>;
export function useGetUserById(dc: DataConnect, vars: GetUserByIdVariables, options?: useDataConnectQueryOptions<GetUserByIdData>): UseDataConnectQueryResult<GetUserByIdData, GetUserByIdVariables>;

export function useListUsersByProximity(vars: ListUsersByProximityVariables, options?: useDataConnectQueryOptions<ListUsersByProximityData>): UseDataConnectQueryResult<ListUsersByProximityData, ListUsersByProximityVariables>;
export function useListUsersByProximity(dc: DataConnect, vars: ListUsersByProximityVariables, options?: useDataConnectQueryOptions<ListUsersByProximityData>): UseDataConnectQueryResult<ListUsersByProximityData, ListUsersByProximityVariables>;

export function useAddUserInterest(options?: useDataConnectMutationOptions<AddUserInterestData, FirebaseError, AddUserInterestVariables>): UseDataConnectMutationResult<AddUserInterestData, AddUserInterestVariables>;
export function useAddUserInterest(dc: DataConnect, options?: useDataConnectMutationOptions<AddUserInterestData, FirebaseError, AddUserInterestVariables>): UseDataConnectMutationResult<AddUserInterestData, AddUserInterestVariables>;
