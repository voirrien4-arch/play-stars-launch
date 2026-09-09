delete from public.publications where app_name = '__bouton_debug_test__' or app_name = '__diagnostic_test__';

select id, app_name, status from public.publications
where app_name in ('__bouton_debug_test__', '__diagnostic_test__');
