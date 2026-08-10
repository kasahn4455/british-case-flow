-- Keep human priority override behind trusted server authority.
-- The function retains its own auth/AAL2/firm-role checks as defense in depth,
-- but is no longer directly executable by the browser-authenticated role.

revoke execute on function public.override_enquiry_priority(
  uuid,
  public.enquiry_priority,
  text
) from authenticated;

grant execute on function public.override_enquiry_priority(
  uuid,
  public.enquiry_priority,
  text
) to service_role;
