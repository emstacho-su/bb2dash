-- bb2dash :: 004_bb_identifiers.sql  (Blackboard primary keys on typed tables)
alter table courses add column bb_id text unique, add column bb_batch_uid text, add column bb_membership_id text;
alter table assignments add column bb_column_id text, add column bb_submission_status text, add column bb_last_seen timestamptz;
create index assignments_bb_column_idx on assignments (bb_column_id);
alter table course_staff add column bb_user_id text;
alter table announcements add column is_read boolean;
alter table bb_content add column bb_type text, add column state text, add column modified_at timestamptz, add column body text, add column detail jsonb, add column run_id uuid;
update courses set bb_id = v.bb_id, bb_batch_uid = v.batch, bb_membership_id = v.mem from (values
 ('ECN.304','_572517_1','19406.1271','_30635472_1'),
 ('GEO.103.lecture','_569316_1','18997.1271','_30596225_1'),
 ('GEO.103.recitation','_569318_1','19111.1271','_30596280_1'),
 ('IST.323','_571529_1','15803.1271','_30624681_1'),
 ('IST.352','_570144_1','15897.1271','_30614146_1'),
 ('IST.466','_570160_1','15941.1271','_30614503_1'),
 ('IST.471','_570161_1','15780.1271','_30779737_1')) as v(id,bb_id,batch,mem) where courses.id = v.id;
update courses set bb_url = 'https://blackboard.syracuse.edu/ultra/courses/'||bb_id||'/outline';
