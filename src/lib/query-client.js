import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: 'always',
			refetchOnReconnect: 'always',
			refetchOnMount: 'always',
			refetchInterval: 5000,
			refetchIntervalInBackground: true,
			staleTime: 0,
			retry: 1,
		},
	},
});