# Codstro AI Chat Architecture & Extension Contract

이 문서는 Codstro AI Chat의 현재 구조, 기존 기능, DB 테이블, Edge Function, AI agent 규칙, Firebase Storage path 규칙, 그리고 React Native 전용 AI Chat 앱에서 추가할 확장 기능 계약을 한 곳에 정리한다.

대상 프로젝트:

- Frontend web: `Codstro_main`
- Supabase Edge Functions: `codstro_supabase_edge_functions`
- Shared DB: Supabase
- Static assets: Firebase Storage

---

## 1. 핵심 방향

AI Chat은 기존 Codstro 웹의 AI 채팅 기능을 유지하면서, React Native 앱에서 더 전문적인 채팅 경험을 제공하도록 확장한다.

중요한 원칙:

- 기존 AI Chat 기능을 줄이지 않는다.
- React Native 앱과 기존 웹은 같은 Supabase DB를 공유한다.
- 이미지, 오디오, 파일, preview thumbnail 등 정적 자산은 Firebase Storage에 저장한다.
- Supabase DB에는 Firebase download URL을 저장하지 않고 Firebase Storage path만 저장한다.
- URL preview, Kakao location, camera image, audio, file은 메시지 metadata/attachment 계약으로 확장한다.
- Prototype이어도 컬럼과 타입을 축소하지 않는다. 이후 실제 서비스 전환을 전제로 상세 정보를 저장한다.

---

## 2. 현재 AI Chat 동작 흐름

### 2.1 User message flow

1. 클라이언트가 채팅방에 진입한다.
2. `chat_rooms`에서 방 정보를 조회한다.
3. `chat_messages`에서 최근 메시지를 조회한다.
4. RPC `get_chat_room_ai_personas`로 채팅방 참여 AI 목록을 조회한다.
5. Supabase Realtime으로 `chat_messages` INSERT를 구독한다.
6. 유저가 메시지를 전송하면 클라이언트가 `chat_messages`에 USER 메시지를 INSERT한다.
7. 클라이언트가 Supabase Edge Function `ai_chat-chat`을 호출한다.
8. Edge Function이 AI 응답을 생성하고 `chat_messages`에 AI 메시지를 INSERT한다.
9. 클라이언트는 Realtime 이벤트로 AI 메시지를 받아 렌더링한다.

### 2.2 AI response flow

`supabase/functions/ai_chat-chat/index.ts`

1. request body에서 `chat_room_id`, `userMessage`를 받는다.
2. `buildContext(chat_room_id, userMessage)`로 agent context를 만든다.
3. 유저 메시지에 mention target이 있으면 해당 AI만 응답한다.
4. mention target이 없으면 채팅방 안의 모든 AI persona가 응답할 수 있다.
5. `room_typing_${chat_room_id}` broadcast channel에 `typing_start`를 보낸다.
6. 각 persona에 대해 `responseAgent(context, persona)`를 실행한다.
7. AI 응답을 `chat_messages`에 INSERT한다.
8. persona별로 `typing_end`를 broadcast한다.
9. 저장된 메시지 index가 50의 배수이면 chat memory job 생성을 요청한다.

---

## 3. 기존 기능 계약

새 React Native 앱은 아래 기능을 모두 지원해야 한다.

### 3.1 Chat rooms

- 채팅방 목록 조회
- 채팅방 검색
- 채팅방 생성
- 채팅방 삭제
- 일상/프로젝트 채팅방 타입 유지

관련 테이블:

- `chat_rooms`
- `chat_room_ai_settings`

관련 RPC:

- `rpc_create_chat_room_with_ai_v2`
- `delete_chat_room`

### 3.2 Messages

- 텍스트 메시지
- 이미지 메시지
- 이모티콘 메시지
- 텍스트 + 이미지 + 이모티콘 조합 메시지
- 답장
- 멘션
- 메시지 interaction mode

관련 테이블:

- `chat_messages`
- `emoticons`

기존 `chat_message_format`:

- `TEXT`
- `IMG`
- `MULTIMODAL`

기존 `chat_message_interaction_type`:

- `CASUAL`
- `ACTION_REQUEST`

### 3.3 Mention

유저 입력에서 `@personaName`을 감지하고, 해당 persona의 `chat_room_ai_id`를 `chat_message_mention_target_agent_id`에 저장한다.

AI 응답 규칙:

- `chat_message_mention_target_agent_id`가 있으면 해당 AI만 응답한다.
- mention target이 없으면 채팅방의 모든 AI가 대화 흐름에 따라 응답할 수 있다.

주의:

- mention target은 `ai_persona_id`가 아니라 `chat_room_ai_id`를 기준으로 비교한다.
- 앞으로도 room 안의 agent instance를 식별하기 위해 `chat_room_ai_id`를 기준으로 사용한다.

### 3.4 Reply

답장 필드:

- `chat_message_reply_message_id`
- `chat_message_reply_target_agent_id`

AI는 답장 메시지를 무조건 복사해서 답장하지 않는다. 특정 과거 메시지를 명확히 참조할 때만 reply field를 사용한다.

### 3.5 Emoticons

이모티콘은 `emoticons` 테이블에 저장된다.

중요 규칙:

- 시스템 기본 Unicode emoji는 AI 응답 텍스트에서 금지한다.
- custom emoticon은 `emoticon_id` 필드로만 표현한다.
- 텍스트 이모티콘(`ㅠㅠ`, `ㅁㅇㅁ`, `ㄷㄷ` 등)은 허용한다.
- AI 응답은 `chat_message_content` 또는 `emoticon_id` 중 최소 하나를 반드시 가져야 한다.

### 3.6 Message mode

유저는 메시지 전송 시 mode를 선택할 수 있다.

- `CASUAL`: 일반 대화
- `ACTION_REQUEST`: 서비스 작업 요청

AI agent는 `ACTION_REQUEST`인 경우 todo 생성 등 tool 사용을 고려할 수 있다.

---

## 4. 주요 DB 테이블

### 4.1 Existing tables

#### `ai_personas`

AI persona의 기본 캐릭터 정보.

주요 필드:

- `ai_persona_id`
- `ai_persona_name`
- `ai_persona_description`
- `ai_persona_category`
- `ai_persona_gender`
- `ai_persona_personality`
- `ai_persona_speech_style`
- `ai_persona_age`
- `ai_persona_preferred_topics`
- `ai_persona_preferred_features`
- `ai_persona_one_line_introduction`
- `ai_persona_profile_image_path`
- `user_id`

#### `user_ai_settings`

유저가 AI persona를 친구로 추가하면서 설정한 관계/감정/권한 정보.

주요 필드:

- `user_ai_setting_id`
- `user_id`
- `ai_persona_id`
- `user_ai_setting_call_me_name`
- `user_ai_setting_ai_self_awareness`
- `user_ai_setting_service_integration`
- `user_ai_setting_emotion`

#### `chat_rooms`

채팅방.

주요 필드:

- `chat_room_id`
- `user_id`
- `chat_room_name`
- `chat_room_type`
- `chat_room_topics`
- `chat_room_latest_message_index`
- `chat_room_last_read_message_index`
- `chat_room_daily_is_main`
- `chat_room_summary`
- `chat_room_summary_message_index`

#### `chat_room_ai_settings`

채팅방과 유저의 AI friend 설정을 연결한다.

주요 필드:

- `chat_room_ai_id`
- `chat_room_id`
- `user_ai_setting_id`

#### `chat_messages`

채팅 메시지.

주요 필드:

- `chat_message_id`
- `chat_room_id`
- `chat_message_sender_type`: `USER` 또는 `AI`
- `chat_message_sender_agent_id`: AI 메시지일 때 `chat_room_ai_id`
- `chat_message_content`
- `chat_message_index`
- `emoticon_id`
- `chat_message_file_content_path`
- `chat_message_format`
- `chat_message_interaction_type`
- `chat_message_reply_message_id`
- `chat_message_reply_target_agent_id`
- `chat_message_mention_target_agent_id`
- `chat_message_metadata`
- `chat_message_client_id`
- `chat_message_source_platform`

#### `emoticons`

custom emoticon metadata.

주요 필드:

- `emoticon_id`
- `emoticon_name`
- `emoticon_img_path`
- `emoticon_tags`

#### `ai_user_records`

유저에 대한 AI 요약 기록.

주요 필드:

- `ai_user_record_id`
- `user_id`
- `ai_user_record_summary`

#### `chat_memorys`

장기 대화 요약 메모리.

주요 필드:

- `chat_memory_id`
- `chat_room_id`
- `chat_memory_contents`
- `start_message_index`
- `end_message_index`

#### `chat_memory_jobs`

대화 요약 생성 job.

주요 필드:

- `chat_memory_job_id`
- `chat_room_id`
- `chat_memory_job_start_index`
- `chat_memory_job_end_index`
- `chat_memory_job_status`
- `chat_memory_job_retry_count`

### 4.2 Added extension tables

#### `chat_message_attachments`

메시지에 연결된 첨부/preview/resource 정보를 저장한다.

목적:

- 이미지
- 카메라 이미지
- 오디오
- 일반 파일
- 링크 preview
- 위치 preview

주요 필드:

- `chat_message_attachment_id`
- `chat_message_id`
- `chat_room_id`
- `attachment_type`
- `storage_provider`
- `storage_path`
- `thumbnail_storage_path`
- `original_file_name`
- `mime_type`
- `file_size_bytes`
- `width`
- `height`
- `duration_ms`
- `transcript`
- `preview_title`
- `preview_description`
- `preview_image_storage_path`
- `preview_url`
- `provider`
- `provider_metadata`
- `created_at`

권장 `attachment_type`:

- `image`
- `camera_image`
- `audio`
- `file`
- `link`
- `location`

#### `chat_link_previews`

URL preview cache.

목적:

- 같은 URL에 대한 preview 중복 fetch 방지
- 유저/AI가 보낸 링크를 일관된 카드로 렌더링

주요 필드:

- `url`
- `title`
- `description`
- `site_name`
- `image_url`
- `image_storage_path`
- `favicon_url`
- `status`
- `fetched_at`
- `updated_at`

권장 정책:

- authenticated user는 select 가능
- insert/update는 Edge Function service role 사용

#### `chat_location_previews`

AI가 전송한 Kakao location preview를 저장한다.

목적:

- AI가 Kakao API 기반 장소/지도 카드를 전송
- 유저가 카드를 클릭하면 Kakao Map URL을 새 창 또는 외부 브라우저로 열기

주요 필드:

- `chat_location_preview_id`
- `chat_message_id`
- `provider`
- `place_name`
- `address_name`
- `road_address_name`
- `latitude`
- `longitude`
- `kakao_place_id`
- `kakao_map_url`
- `thumbnail_storage_path`
- `created_at`

---

## 5. RLS 정책 방향

새로 추가한 테이블은 Row Level Security를 켠다.

### 5.1 `chat_message_attachments`

접근 원칙:

- 해당 `chat_room_id`를 소유한 유저만 select/insert 가능하다.
- delete/update는 초기에는 막고, 필요 시 소유자만 허용한다.
- Edge Function service role은 RLS를 우회할 수 있다.

### 5.2 `chat_link_previews`

접근 원칙:

- 로그인 유저는 preview cache를 읽을 수 있다.
- preview cache 생성/갱신은 Edge Function service role이 담당한다.

### 5.3 `chat_location_previews`

접근 원칙:

- 연결된 `chat_message_id`의 채팅방 소유자만 select 가능하다.
- insert는 AI location 생성 Edge Function 또는 service role 흐름에서 수행하는 것을 권장한다.

---

## 6. Firebase Storage 계약

### 6.1 Storage provider

정적 자산은 Firebase Storage를 사용한다.

대상:

- AI persona profile image
- emoticon image
- chat image
- camera image
- audio recording
- shared file
- link preview image cache
- location preview image cache

### 6.2 DB에는 URL이 아니라 path 저장

DB에는 Firebase download URL을 저장하지 않는다.

저장해야 하는 값:

```txt
aichat-assets/rooms/{roomId}/messages/{messageId}/images/{fileName}
```

저장하지 말아야 하는 값:

```txt
https://firebasestorage.googleapis.com/...
```

렌더링 또는 AI 분석 시에만 path를 URL로 변환한다.

웹 클라이언트:

- Firebase Web SDK `getDownloadURL(ref(storage, path))`

Edge Function:

- Firebase Admin SDK `bucket.file(path).getSignedUrl(...)`

### 6.3 Recommended path structure

Firebase Storage의 folder는 실제 directory가 아니라 object path prefix이다. 아래 경로는 미리 만들 필요가 없고, 파일이 업로드되면 Firebase Console에 폴더처럼 표시된다.

```txt
aichat-assets/
  rooms/{roomId}/messages/{messageId}/images/{fileName}
  rooms/{roomId}/messages/{messageId}/camera/{fileName}
  rooms/{roomId}/messages/{messageId}/audio/{fileName}
  rooms/{roomId}/messages/{messageId}/files/{fileName}
  rooms/{roomId}/messages/{messageId}/thumbnails/{fileName}
  previews/links/{urlHash}/{fileName}
  previews/locations/kakao/{placeId}/{fileName}
```

현재 웹은 기존 호환을 위해 아래 path도 사용할 수 있다.

```txt
aichat-assets/{roomId}/{fileName}
```

신규 React Native 앱은 `rooms/{roomId}/messages/{messageId}/...` 구조를 우선 사용한다.

---

## 7. Message metadata contract

`chat_messages.chat_message_metadata`는 메시지의 확장 정보를 담는다.

기본 형태:

```json
{
  "version": 1,
  "attachments": [],
  "linkPreviews": [],
  "locationPreview": null,
  "client": {
    "platform": "web",
    "appVersion": null
  }
}
```

### 7.1 Link metadata

```json
{
  "type": "link",
  "url": "https://example.com",
  "title": "Example title",
  "description": "Example description",
  "siteName": "Example",
  "imageUrl": "https://example.com/og.png",
  "imageStoragePath": "aichat-assets/previews/links/hash/og.png",
  "faviconUrl": "https://example.com/favicon.ico"
}
```

### 7.2 Kakao location metadata

AI만 location message를 보낼 수 있다.

```json
{
  "type": "location",
  "provider": "kakao",
  "placeName": "카카오 판교아지트",
  "addressName": "경기 성남시 분당구 백현동 ...",
  "roadAddressName": "경기 성남시 분당구 판교역로 ...",
  "latitude": 37.0,
  "longitude": 127.0,
  "kakaoPlaceId": "123456",
  "kakaoMapUrl": "https://place.map.kakao.com/123456",
  "thumbnailStoragePath": "aichat-assets/previews/locations/kakao/123456/map.png"
}
```

### 7.3 Image/camera metadata

```json
{
  "type": "camera_image",
  "storagePath": "aichat-assets/rooms/roomId/messages/messageId/camera/file.jpg",
  "mimeType": "image/jpeg",
  "fileSizeBytes": 123456,
  "width": 1280,
  "height": 960,
  "originalFileName": "camera.jpg"
}
```

### 7.4 Audio metadata

AI는 음성으로 답하지 않는다. 오디오는 유저 전용 입력 기능이다.

```json
{
  "type": "audio",
  "storagePath": "aichat-assets/rooms/roomId/messages/messageId/audio/recording.m4a",
  "mimeType": "audio/mp4",
  "fileSizeBytes": 123456,
  "durationMs": 43000,
  "transcript": "유저 음성 STT 결과"
}
```

AI 분석 입력에는 가능한 경우 `transcript`를 포함한다.

### 7.5 File metadata

```json
{
  "type": "file",
  "storagePath": "aichat-assets/rooms/roomId/messages/messageId/files/report.pdf",
  "mimeType": "application/pdf",
  "fileSizeBytes": 345678,
  "originalFileName": "report.pdf",
  "thumbnailStoragePath": null
}
```

---

## 8. Implemented and planned feature details

### 8.1 URL preview

Status: implemented for web and reusable by React Native.

지원 대상:

- 유저가 보낸 URL
- AI가 보낸 URL

현재 구현 흐름:

1. 메시지 content에서 URL을 감지한다.
2. `chat_link_previews`에서 cache를 조회한다.
3. cache miss이면 `ai_chat-create_link_preview` Edge Function에서 Open Graph/Twitter/title metadata를 fetch한다.
4. 유저가 URL을 보내는 경우, 웹 클라이언트가 전송 전에 preview를 만들고 `chat_message_metadata.attachments`에 `type: "link"`로 저장한다.
5. AI가 URL을 텍스트로 보내는 경우, 웹 `MessageBubble`이 수신 메시지 content에서 URL을 감지하고 preview function을 호출해 link card를 렌더링한다.
6. 클라이언트는 link preview card를 렌더링한다.
7. card click 시 외부 브라우저 또는 in-app browser로 URL을 연다.

구현된 Edge Function:

- `ai_chat-create_link_preview`

보안 규칙:

- preview 대상 URL은 `http`/`https`만 허용한다.
- `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `10.x.x.x`, `172.16.x.x~172.31.x.x`, `192.168.x.x`, `169.254.x.x` 등 local/private 주소는 차단한다.
- 이는 함수를 호출하는 클라이언트를 막는 것이 아니라, Edge Function이 대신 fetch할 대상 URL을 제한하는 것이다.

현재 제한:

- preview image는 아직 Firebase Storage에 복사하지 않고 원본 `image_url`을 사용한다.
- 실패한 URL은 `chat_link_previews.status = "failed"`로 cache될 수 있다.

### 8.2 Kakao location preview

Status: implemented for AI-sent web cards and reusable by React Native.

지원 대상:

- AI만 location card를 전송한다.
- 유저는 위치 메시지를 직접 보내지 않는다.

현재 구현 흐름:

1. 유저가 장소 요청을 한다.
2. AI agent가 `searchKakaoPlace` tool을 호출한다.
3. tool은 Kakao Local keyword search API에서 장소명, 주소, 좌표, Kakao map URL을 받는다.
4. AI 응답에 location metadata를 포함한다.
5. `ai_chat-chat` Edge Function이 AI 메시지를 저장한 뒤 `chat_location_previews`에도 location preview row를 저장한다.
6. 웹 `MessageBubble`은 `chat_message_metadata.attachments`의 `type: "location"`을 Kakao location card로 렌더링한다.
7. card click 시 Kakao Map URL을 새 창 또는 외부 브라우저로 연다.

중요 규칙:

- AI가 좌표나 Kakao URL을 상상해서 만들면 안 된다.
- location card는 Kakao API 결과 기반으로만 생성한다.

구현된 tool:

- `searchKakaoPlace`

필요 env:

- `KAKAO_REST_API_KEY`

관련 DB:

- `chat_messages.chat_message_metadata`
- `chat_location_previews`

현재 제한:

- 지도 이미지를 렌더링하지 않고, 웹에서는 간단한 Kakao-style card placeholder와 장소 정보를 표시한다.
- 유저가 직접 위치를 보내는 기능은 지원하지 않는다.
- 위치 card는 AI 응답에서만 생성한다.

### 8.3 Camera

Status: planned for React Native only.

지원 대상:

- 유저 전용 기능
- 웹에서는 구현하지 않는다.

권장 흐름:

1. 채팅 입력창에서 camera action 선택.
2. 권한 요청.
3. 사진 촬영.
4. Firebase Storage에 upload.
5. DB에는 Firebase Storage path 저장.
6. `chat_messages`와 `chat_message_attachments`에 기록.
7. `ai_chat-chat` 호출.
8. Edge Function은 path를 signed URL로 변환하고 OpenAI vision input으로 전달한다.

### 8.4 Audio

Status: planned for React Native only.

지원 대상:

- 유저 전용 기능
- AI는 음성 파일로 응답하지 않는다.
- 웹에서는 구현하지 않는다.

입력 방식:

- 기존 오디오 파일 선택
- 채팅창에서 바로 녹음

권장 흐름:

1. 오디오 파일 생성 또는 선택.
2. Firebase Storage에 upload.
3. DB에는 Firebase Storage path 저장.
4. STT Edge Function으로 transcript 생성.
5. transcript를 `chat_message_metadata`, `chat_message_attachments.transcript`, 또는 `chat_message_content`에 저장한다.
6. AI agent는 transcript를 분석해 텍스트로 답변한다.

후보 Edge Function:

- `ai_chat-transcribe_audio`

### 8.5 File sharing

Status: existing basic file/image path flow in web, full file sharing renderer planned for React Native.

지원 대상:

- 유저 파일 공유
- 기존 파일 공유 기능 유지

권장 흐름:

1. Document picker로 파일 선택.
2. Firebase Storage upload.
3. DB에는 Firebase Storage path 저장.
4. `chat_message_attachments`에 파일 metadata 저장.
5. 클라이언트는 file card를 렌더링한다.

파일 내용 분석은 별도 확장 기능으로 다룬다.

---

## 9. Current AI tools

`supabase/functions/ai_chat-chat/agent/agent.ts`에서 사용하는 OpenAI function tools.

### 9.1 Chat tools

#### `getChatHistory`

채팅방의 raw message history를 페이지 단위로 조회한다.

사용 기준:

- 최근 메시지 20개보다 오래된 raw context가 필요할 때
- 특정 과거 메시지에 답장을 걸어야 할 때

#### `getChatMemory`

`chat_memorys`에 저장된 요약 메모리를 조회한다.

사용 기준:

- 긴 대화의 장기 맥락을 빠르게 파악해야 할 때

### 9.2 Crawl tools

#### `crawlUrl`

URL의 HTML을 가져와 텍스트로 정리한다.

사용 기준:

- 유저가 보낸 URL의 본문 분석이 필요할 때

#### `fetchYoutube`

YouTube URL에서 video metadata를 가져온다.

사용 기준:

- 유저가 YouTube 링크를 보냈을 때

### 9.3 Content tools

#### `getEmoji`

custom emoticon 조회.

사용 기준:

- AI가 강한 감정 표현을 custom emoticon으로 보내야 할 때

#### `getFileUrl`

Firebase Storage path를 signed URL로 변환한다.

사용 기준:

- AI가 첨부 이미지/파일을 분석해야 할 때

### 9.4 Service tools

#### `createTodo`

할 일을 생성한다.

사용 기준:

- 유저가 명확하게 todo 생성 요청을 했을 때

#### `getUserInfo`

`ai_user_records`에서 유저 요약 정보를 조회한다.

사용 기준:

- 유저 개인 기록을 참고해야 할 때

#### `getCurrentTime`

현재 시각 또는 지역 시각 조회.

사용 기준:

- 시간/일정 관련 응답이 필요할 때

### 9.5 Location tools

#### `searchKakaoPlace`

Kakao Local keyword search API로 장소를 검색한다.

반환 정보:

- `id`
- `placeName`
- `categoryName`
- `phone`
- `addressName`
- `roadAddressName`
- `longitude`
- `latitude`
- `kakaoMapUrl`

사용 기준:

- 유저가 장소, 지도, 주소, 근처 추천, 만날 장소, 음식점/카페/상점 추천 등 location-specific 요청을 했을 때
- AI가 location card를 생성해야 할 때

중요 규칙:

- AI는 location attachment를 만들기 전에 반드시 `searchKakaoPlace`를 호출해야 한다.
- 좌표, 주소, Kakao place ID, Kakao map URL은 tool 결과에서 그대로 복사해야 한다.
- tool 결과가 없거나 부적절하면 location attachment를 만들지 않고 텍스트로만 답한다.

필요 env:

- `KAKAO_REST_API_KEY`

---

## 10. AI agent response contract

현재 `responseFormat.ts`는 아래 필드를 요구한다.

```ts
type AgentResponse = {
  chat_message_content: string;
  chat_message_format: "TEXT" | "IMG" | "MULTIMODAL";
  chat_message_interaction_type: "CASUAL" | "ACTION_REQUEST";
  emoticon_id: string;
  chat_message_file_content_path: string[];
  chat_message_metadata: {
    version: number;
    attachments: Array<Record<string, unknown>>;
    client?: {
      platform: string;
      appVersion?: string | null;
    };
  };
  chat_message_reply_message_id: string;
  chat_message_reply_target_agent_id: string;
  chat_message_mention_target_agent_id: string;
};
```

Attachment별 권장 형태:

```ts
type AgentResponseV2 = {
  chat_message_content: string;
  chat_message_format: "TEXT" | "IMG" | "MULTIMODAL";
  chat_message_interaction_type: "CASUAL" | "ACTION_REQUEST";
  emoticon_id: string;
  chat_message_file_content_path: string[];
  chat_message_reply_message_id: string;
  chat_message_reply_target_agent_id: string;
  chat_message_mention_target_agent_id: string;
  chat_message_metadata: {
    version: 1;
    attachments: Array<
      | LinkAttachment
      | LocationAttachment
      | ImageAttachment
      | AudioAttachment
      | FileAttachment
    >;
  };
};
```

호환성 규칙:

- `chat_message_format`은 당분간 기존 3개 값을 유지한다.
- 세부 attachment type은 `chat_message_metadata`와 `chat_message_attachments.attachment_type`에서 구분한다.
- 기존 웹이 `TEXT`/`IMG`/`MULTIMODAL`만 기대하는 동안 format enum을 급하게 늘리지 않는다.
- `chat_message_metadata`는 AI 응답에서 필수이며, 첨부가 없으면 `{ version: 1, attachments: [] }`를 반환한다.

---

## 11. Chat memory system

장기 기억은 50개 메시지 단위로 생성한다.

관련 함수:

- `ai_chat-create_chat_memory_job`
- `ai_chat-process_chat_memory_job`
- `ai_chat-schedule_chat_memory_job`

흐름:

1. AI 메시지 저장 후 latest message index를 확인한다.
2. index가 50의 배수이면 `ai_chat-create_chat_memory_job`을 호출한다.
3. pending/processing job이 있으면 중복 생성을 건너뛴다.
4. 마지막 memory end index 이후 메시지를 50개 단위 job으로 나눈다.
5. 각 job은 `ai_chat-process_chat_memory_job`으로 처리한다.
6. `gpt-4.1-mini`가 메시지 범위를 요약한다.
7. 결과를 `chat_memorys`에 저장한다.

---

## 12. React Native app contract

React Native AI Chat 앱의 1차 목표:

- 로그인
- AI Chat main
- 채팅방 리스트
- 채팅방 상세
- 기존 AI Chat 기능 전체 접근
- 신규 attachment 기능 기반 확장

### 12.1 Required screens

- Login
- Chat Rooms List
- Chat Conversation
- AI Persona/Friends access, if needed
- User AI info access, if needed

### 12.2 Required chat input features

- text
- mention
- reply
- emoticon picker
- message mode toggle
- camera
- image/file picker
- audio recorder
- audio file picker

### 12.3 Required renderers

- text bubble
- emoticon bubble
- image bubble
- link preview card
- Kakao location card
- audio player card
- file card
- reply preview
- mention label/chip
- typing indicator

### 12.4 Platform values

Use `chat_message_source_platform`:

- `web`
- `ios`
- `android`
- `react_native`

Use `chat_message_client_id` for optimistic UI and duplicate prevention.

---

## 13. Implementation order

Current status and next order:

Done:

1. DB schema and RLS setup.
2. Firebase Storage path contract.
3. Web type alignment for `chat_message_metadata`.
4. Edge Function response schema extension.
5. Link preview Edge Function.
6. Web link preview sending/rendering.
7. Kakao place search tool and location response handling.
8. Web Kakao location card rendering.

Next:

1. React Native project setup.
2. Shared Supabase/Firebase client setup.
3. Login and session persistence.
4. Chat room list.
5. Chat conversation with existing features.
6. Text/image/emoticon/reply/mention/mode support.
7. URL preview card reuse.
8. Kakao location card reuse.
9. Camera image capture/upload.
10. Audio recording/upload/transcription.
11. Full file sharing renderer polish.

---

## 14. Open questions

Remaining questions for React Native implementation:

- Will message attachment rows be inserted directly by clients or through Edge Functions?
- Which STT provider will be used for audio transcription?
- Should camera/audio/file attachments create rows in `chat_message_attachments` immediately in the client, or should this be centralized in an Edge Function?
- Should React Native use the same Firebase Web SDK style APIs or native Firebase SDK wrappers?
- Should old web messages that stored download URLs in `chat_message_file_content_path` be migrated to Firebase Storage paths?
- Should Kakao map preview thumbnails be generated later, or should text + Kakao link card remain the standard?

---

## 15. Related files

Frontend web:

- `Codstro_main/src/pages/AiChat/ChatConversationPage.tsx`
- `Codstro_main/src/api/AiChat/ChatConversationPage.ts`
- `Codstro_main/src/components/AiChat/ChatConversation/MessageBubble.tsx`
- `Codstro_main/src/components/AiChat/ChatConversation/ChatInput/ChatInput.tsx`
- `Codstro_main/src/db/firebase/firebase.ts`
- `Codstro_main/src/store/ImageStore.ts`

Edge Functions:

- `supabase/functions/ai_chat-chat/index.ts`
- `supabase/functions/ai_chat-chat/context.ts`
- `supabase/functions/ai_chat-chat/agent/agent.ts`
- `supabase/functions/ai_chat-chat/agent/responseFormat.ts`
- `supabase/functions/ai_chat-chat/prompt/prompt.ts`
- `supabase/functions/ai_chat-chat/tools/file/getFileUrl.ts`
- `supabase/functions/ai_chat-chat/tools/location/searchKakaoPlace.ts`
- `supabase/functions/ai_chat-create_link_preview/index.ts`
- `supabase/functions/ai_chat-create_chat_memory_job/index.ts`
- `supabase/functions/ai_chat-process_chat_memory_job/index.ts`
- `supabase/functions/ai_chat-schedule_chat_memory_job/index.ts`

Existing tool reference:

- `ai_chat_tools.md`
