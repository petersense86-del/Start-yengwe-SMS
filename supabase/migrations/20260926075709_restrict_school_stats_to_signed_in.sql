-- Dashboard statistics are only for signed-in users.
revoke execute on function public.get_school_stats() from anon;
