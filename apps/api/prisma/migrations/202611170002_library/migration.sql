-- Account-backed library step. Likes, playlists and playlist tracks already exist
-- (initial migration); the API now writes them. Defense in depth for names the
-- API already validates: a playlist title can never be blank.
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_title_not_blank" CHECK (btrim("title") <> '');
