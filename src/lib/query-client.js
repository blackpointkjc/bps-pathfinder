import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
			refetchOnMount: true,
			// Do not globally poll every query. Live/critical screens define their own
			// refresh cadence or subscriptions; global 5s polling was exhausting the
			// Base44 request budget and starving the CAD/GRAC call feed.
			refetchInterval: false,
			refetchIntervalInBackground: false,
			staleTime: 30000,
			retry: 1,
		},
	},
});