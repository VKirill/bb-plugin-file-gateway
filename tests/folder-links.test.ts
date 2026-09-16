import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assetUrl, crumbs, fileKind, folderLinkPath, joinPath} from '../folder-links.js';

test('folder links: relative, absolute, trailing slash, file URL', () => {
  assert.equal(folderLinkPath('.bb/chats/thr_qhrr8bn95r/artifacts/vk-post-autumn'), '.bb/chats/thr_qhrr8bn95r/artifacts/vk-post-autumn');
  assert.equal(folderLinkPath('/home/ubuntu/apps/site/public/'), '/home/ubuntu/apps/site/public/');
  assert.equal(folderLinkPath('docs/Отчёты%20за%20сентябрь'), 'docs/Отчёты за сентябрь');
  assert.equal(folderLinkPath('file:///Users/me/Pictures'), '/Users/me/Pictures');
});

test('folder links: files, URLs and app routes are ignored', () => {
  assert.equal(folderLinkPath('docs/report.md'), null);
  assert.equal(folderLinkPath('artifacts/post.jpg'), null);
  assert.equal(folderLinkPath('https://example.com/folder'), null);
  assert.equal(folderLinkPath('mailto:a@b.c'), null);
  assert.equal(folderLinkPath('#section'), null);
  assert.equal(folderLinkPath('/projects/proj_1/threads/thr_1'), null);
});

test('file kinds, paths and breadcrumbs', () => {
  assert.equal(fileKind('post.JPG'), 'image');
  assert.equal(fileKind('brief.pdf'), 'pdf');
  assert.equal(fileKind('clip.mp4'), 'video');
  assert.equal(fileKind('comment.txt'), 'document');
  assert.equal(joinPath('/a/b', 'c.png'), '/a/b/c.png');
  assert.equal(joinPath('/', 'etc'), '/etc');
  assert.deepEqual(crumbs('/home/ubuntu'), [{name: '/', path: '/'}, {name: 'home', path: '/home'}, {name: 'ubuntu', path: '/home/ubuntu'}]);
  assert.equal(assetUrl('https://bb/preview/abc', 'post 1.jpg'), 'https://bb/preview/abc/post%201.jpg');
});
