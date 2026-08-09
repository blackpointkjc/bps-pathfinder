import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			// Do not refetch the entire application merely because the user switches
			// windows/tabs and comes back. Page-specific realtime subscriptions and
			// explicit refresh controls handle live data without resetting form state.
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
			refetchOnMount: false,
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