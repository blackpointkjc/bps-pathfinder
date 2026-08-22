import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			// Do not refetch the entire application merely because the user switches
			// windows/tabs and comes back. Page-specific realtime subscriptions and
			// explicit refresh controls handle live data without resetting form state.
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
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
			retry: 1,
		},
	},
});