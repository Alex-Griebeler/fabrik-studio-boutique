// Re-export all session hooks from split modules for backward compatibility
export { useAutoGenerateSessions, useClassSessions } from "./useSessionQueries";
export {
  useCreateSession,
  useUpdateSession,
  useUpdateSessionStatus,
  useCancelSession,
  useTrainerCheckin,
  useStudentCheckin,
  useCompleteSession,
  useDeleteSession,
} from "./useSessionMutations";
export {
  useCancelSingleOccurrence,
  useDeleteThisAndFollowing,
  useDeleteAllOccurrences,
  useUpdateThisAndFollowing,
  useUpdateAllOccurrences,
} from "./useSessionRecurring";
export { useCreateBooking, useUpdateBookingStatus } from "./useSessionBookings";
