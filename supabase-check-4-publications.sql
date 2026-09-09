select id, app_name, package_name, owner_id, owner_name, status, created_at
from public.publications
order by created_at desc
limit 15;
