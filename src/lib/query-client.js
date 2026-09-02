import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			// Do not refetch the entire application merely because the user switches
			// windows/tabs and comes back. Page-specific realtime subscriptions and
			// explicit refresh controls handle live data without resetting form state.
			refetchOnWindowFocus: false,
			// Reconnect previously caused every mounted query to refetch at once,
			// producing a burst of requests immediately after Wi-Fi/cellular recovery.
			// Realtime subscriptions, page refresh controls, and normal stale queries
			// recover individually instead.
			refetchOnReconnect: false,
			// Navigating to a page must load that page's current data. This is separate
			// from window focus: minimizing/restoring remains disabled above, so forms
			// are not torn down just because the browser loses focus.
			refetchOnMount: true,
			// Do not globally poll every query. Live/critical screens define their own
			// refresh cadence or subscriptions; global 5s polling was exhausting the
			// Base44 request budget and starving the CAD/GRAC call feed.
			refetchInterval: false,
			refetchIntervalInBackground: false,
			// Many legacy pages provide initialData: [] only to keep rendering safe.
			// Treat that placeholder as stale immediately so the page performs its
			// first real fetch on mount instead of looking empty for 30 seconds.
			staleTime: 0,
			// Never automatically retry a rate-limit response. Retrying a 429 from
			// dozens of mounted queries multiplies the problem. Other transient query
			// failures get one delayed retry.
			retry: (failureCount, error) => {
				const message = String(error?.message || error?.response?.data?.message || error || '');
				if (/rate limit|too many requests|\b429\b/i.test(message)) return false;
				return failureCount < 1;
			},
			retryDelay: failureCount => Math.min(2000 * (2 ** failureCount), 10000),
		},
	},
});