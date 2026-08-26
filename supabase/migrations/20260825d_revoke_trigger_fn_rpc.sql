-- change_log_stamp_actor() is a TRIGGER function, but living in the public
-- schema made it callable by anyone as /rest/v1/rpc/change_log_stamp_actor
-- (advisor lints 0028 + 0029). Trigger privileges are checked at CREATE TRIGGER
-- time, not per fire, so revoking EXECUTE does not stop the audit stamp.
-- Verified before applying: a contractor INSERT into change_log still succeeds
-- and still gets actor_uid stamped.
revoke execute on function public.change_log_stamp_actor() from anon, authenticated, public;
