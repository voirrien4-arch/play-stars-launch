select session_id, step, detail, progress_percent, duration_ms, created_at
from public.upload_logs
order by created_at desc
limit 40;
