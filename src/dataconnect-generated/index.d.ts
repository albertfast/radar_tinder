import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface AddUserInterestData {
  userInterest_insert: UserInterest_Key;
}

export interface AddUserInterestVariables {
  userId: UUIDString;
  interestId: UUIDString;
}

export interface CreateNewUserData {
  user_insert: User_Key;
}

export interface CreateNewUserVariables {
  username: string;
  email: string;
  dateOfBirth: DateString;
  gender: string;
  passwordHash: string;
  latitude: number;
  longitude: number;
}

export interface GetUserByIdData {
  user?: {
    id: UUIDString;
    username: string;
    email: string;
    bio?: string | null;
    createdAt: TimestampString;
    dateOfBirth: DateString;
    gender: string;
    lastActiveAt?: TimestampString | null;
    latitude: number;
    longitude: number;
    lookingForGender?: string | null;
    profilePictureUrl?: string | null;
  } & User_Key;
}

export interface GetUserByIdVariables {
  id: UUIDString;
}

export interface Interest_Key {
  id: UUIDString;
  __typename?: 'Interest_Key';
}

export interface Like_Key {
  likerId: UUIDString;
  likedId: UUIDString;
  __typename?: 'Like_Key';
}

export interface ListUsersByProximityData {
  users: ({
    id: UUIDString;
    username: string;
    latitude: number;
    longitude: number;
  } & User_Key)[];
}

export interface ListUsersByProximityVariables {
  latitude: number;
  longitude: number;
  limit?: number | null;
}

export interface Match_Key {
  user1Id: UUIDString;
  user2Id: UUIDString;
  __typename?: 'Match_Key';
}

export interface Message_Key {
  id: UUIDString;
  __typename?: 'Message_Key';
}

export interface UserInterest_Key {
  userId: UUIDString;
  interestId: UUIDString;
  __typename?: 'UserInterest_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface CreateNewUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateNewUserVariables): MutationRef<CreateNewUserData, CreateNewUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateNewUserVariables): MutationRef<CreateNewUserData, CreateNewUserVariables>;
  operationName: string;
}
export const createNewUserRef: CreateNewUserRef;

export function createNewUser(vars: CreateNewUserVariables): MutationPromise<CreateNewUserData, CreateNewUserVariables>;
export function createNewUser(dc: DataConnect, vars: CreateNewUserVariables): MutationPromise<CreateNewUserData, CreateNewUserVariables>;

interface GetUserByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserByIdVariables): QueryRef<GetUserByIdData, GetUserByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetUserByIdVariables): QueryRef<GetUserByIdData, GetUserByIdVariables>;
  operationName: string;
}
export const getUserByIdRef: GetUserByIdRef;

export function getUserById(vars: GetUserByIdVariables): QueryPromise<GetUserByIdData, GetUserByIdVariables>;
export function getUserById(dc: DataConnect, vars: GetUserByIdVariables): QueryPromise<GetUserByIdData, GetUserByIdVariables>;

interface ListUsersByProximityRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListUsersByProximityVariables): QueryRef<ListUsersByProximityData, ListUsersByProximityVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ListUsersByProximityVariables): QueryRef<ListUsersByProximityData, ListUsersByProximityVariables>;
  operationName: string;
}
export const listUsersByProximityRef: ListUsersByProximityRef;

export function listUsersByProximity(vars: ListUsersByProximityVariables): QueryPromise<ListUsersByProximityData, ListUsersByProximityVariables>;
export function listUsersByProximity(dc: DataConnect, vars: ListUsersByProximityVariables): QueryPromise<ListUsersByProximityData, ListUsersByProximityVariables>;

interface AddUserInterestRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddUserInterestVariables): MutationRef<AddUserInterestData, AddUserInterestVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: AddUserInterestVariables): MutationRef<AddUserInterestData, AddUserInterestVariables>;
  operationName: string;
}
export const addUserInterestRef: AddUserInterestRef;

export function addUserInterest(vars: AddUserInterestVariables): MutationPromise<AddUserInterestData, AddUserInterestVariables>;
export function addUserInterest(dc: DataConnect, vars: AddUserInterestVariables): MutationPromise<AddUserInterestData, AddUserInterestVariables>;

