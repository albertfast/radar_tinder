# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useCreateNewUser, useGetUserById, useListUsersByProximity, useAddUserInterest } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useCreateNewUser(createNewUserVars);

const { data, isPending, isSuccess, isError, error } = useGetUserById(getUserByIdVars);

const { data, isPending, isSuccess, isError, error } = useListUsersByProximity(listUsersByProximityVars);

const { data, isPending, isSuccess, isError, error } = useAddUserInterest(addUserInterestVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { createNewUser, getUserById, listUsersByProximity, addUserInterest } from '@dataconnect/generated';


// Operation CreateNewUser:  For variables, look at type CreateNewUserVars in ../index.d.ts
const { data } = await CreateNewUser(dataConnect, createNewUserVars);

// Operation GetUserById:  For variables, look at type GetUserByIdVars in ../index.d.ts
const { data } = await GetUserById(dataConnect, getUserByIdVars);

// Operation ListUsersByProximity:  For variables, look at type ListUsersByProximityVars in ../index.d.ts
const { data } = await ListUsersByProximity(dataConnect, listUsersByProximityVars);

// Operation AddUserInterest:  For variables, look at type AddUserInterestVars in ../index.d.ts
const { data } = await AddUserInterest(dataConnect, addUserInterestVars);


```