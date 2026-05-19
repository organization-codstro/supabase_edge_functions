<div id="top"></div>

<br />
<div align="center">
    <img src="./images/logo.png" alt="Logo" width="80" height="80">
  <h3 align="center">Aichat-tools (1.0.0)</h3>

  <p align="center">
    Ai chat에 사용되는 tool의 종류와 사용되는 기준을 설명합니다.
  </p>

</div>
<br />

# ai_chat-chat tools 정리

`supabase/functions/ai_chat-chat`에서 AI agent가 사용하는 도구들은 OpenAI 함수 호출(Function Calling) 형태로 정의되어 있습니다. 이 도구들은 AI가 외부 데이터 조회, URL 크롤링, 이미지 파일 접근, 이모티콘 검색, 할 일 생성 등 실제 작업을 수행할 수 있도록 합니다.

---

## 1. Chat 관련 도구

### 1.1 `getChatHistory`

- 종류: OpenAI function tool
- 파일: `tools/chat/getChatHistory.ts`
- 역할: 채팅방의 대화 내역을 페이지 단위로 가져옵니다.
- 설명:
  - `roomId`와 `index`를 받아서 채팅 메시지를 조회합니다.
  - 기본적으로 처음에 제공된 최근 메시지 20개 이후부터 50개 단위로 추가 메시지를 페이징합니다.
  - `index = 0`은 최신 50개 메시지, `index = 1`은 그 이전 50개 메시지를 조회합니다.
- 만든 이유:
  - AI가 더 깊은 대화 맥락을 필요로 할 때, 기존 메시지를 다시 읽거나 과거 대화를 참조하기 위해 사용합니다.
  - raw 채팅 텍스트를 직접 DB에서 가져와 분석할 수 있게 합니다.

### 1.2 `getChatMemory`

- 종류: OpenAI function tool
- 파일: `tools/chat/getChatMemory.ts`
- 역할: 대화 요약(메모리) 목록을 가져옵니다.
- 설명:
  - `chat_memorys` 테이블에서 50개 메시지 단위로 생성된 요약을 10개씩 페이지네이션합니다.
  - 각 요약에는 `start_message_index` / `end_message_index`가 있어, 대화 구간을 파악할 수 있습니다.
  - 최신 요약이 먼저 나오며 `index = 0`은 가장 최근 요약 10개입니다.
- 만든 이유:
  - 전체 대화 기록을 모두 로딩하지 않고도 과거 맥락을 빠르게 이해할 수 있게 하기 위함입니다.
  - 요약 메모리를 통해 AI가 장기 기억을 참고하도록 돕습니다.

---

## 2. 외부 데이터 조회 도구

### 2.1 `crawlUrl`

- 종류: OpenAI function tool
- 파일: `tools/crawl/crawlUrl.ts`
- 역할: 주어진 웹 페이지 URL을 크롤링하여 텍스트를 반환합니다.
- 설명:
  - URL을 요청하고 HTML을 읽은 후, 스크립트/스타일/태그를 제거하여 텍스트 형태로 반환합니다.
  - 결과는 최대 5000자 이내로 잘라서 반환합니다.
- 만든 이유:
  - 사용자가 외부 URL을 공유했을 때 내용을 요약하거나 분석할 수 있도록 하기 위함입니다.
  - 최신 정보가 필요하거나 웹 페이지의 구체적 내용을 참조해야 할 때 사용합니다.

### 2.2 `fetchYoutube`

- 종류: OpenAI function tool
- 파일: `tools/crawl/Fetchyoutube.ts`
- 역할: YouTube URL로부터 영상 메타데이터를 가져옵니다.
- 설명:
  - YouTube URL에서 videoId를 추출하고 YouTube Data API를 호출합니다.
  - 제목, 설명, 채널명, 조회수, 좋아요 수, 태그, 썸네일, 게시일 등을 반환합니다.
- 만든 이유:
  - 사용자가 YouTube 링크를 제공했을 때 영상 내용을 빠르게 파악하고 요약하기 위해서입니다.
  - 단순 URL 분석이 아니라 영상 메타 정보를 활용한 응답을 가능하게 합니다.

---

## 3. 표현/콘텐츠 도구

### 3.1 `getEmoji`

- 종류: OpenAI function tool
- 파일: `tools/emoji/getEmoji.ts`
- 역할: 이모티콘을 검색하거나 특정 이모티콘 정보를 조회합니다.
- 설명:
  - `emoticonId`가 주어지면 해당 이모티콘 정보를 반환합니다.
  - `tag`가 주어지면 태그와 일치하는 이모티콘 목록을 최대 10개까지 반환합니다.
  - 태그가 없거나 검색 결과가 없으면 전체 이모티콘 중 일부를 반환합니다.
- 만든 이유:
  - AI가 감정이나 반응을 더 풍부하게 표현할 수 있도록 하기 위함입니다.
  - 이모티콘을 통해 사용자 메시지에 감정적 뉘앙스를 추가할 수 있습니다.

### 3.2 `getFileUrl`

- 종류: OpenAI function tool
- 파일: `tools/file/getFileUrl.ts`
- 역할: Firebase Storage 파일 경로를 받아 서명된 다운로드 URL을 생성합니다.
- 설명:
  - Firebase Storage에 저장된 이미지/파일의 임시 접근 URL(1시간)을 생성합니다.
  - AI가 첨부된 이미지를 볼 수 있도록 URL을 제공합니다.
- 만든 이유:
  - 유저가 이미지 파일을 첨부했을 때 AI가 해당 이미지를 확인하거나 분석할 수 있게 하기 위함입니다.
  - vision 기반 입력을 지원하기 위한 파일 접근 도구입니다.

---

## 4. 유틸리티 도구

### 4.1 `getCurrentTime`

- 종류: OpenAI function tool
- 파일: `tools/time/getCurrentTime.ts`
- 역할: 현재 시간을 반환합니다.
- 설명:
  - `location`을 입력받아 해당 지역의 대표 타임존을 파악합니다.
  - 국가/도시 이름 또는 IANA 타임존 값을 지원합니다.
  - 인식되지 않으면 서버 기본 타임존을 사용합니다.
- 만든 이유:
  - 시간 관련 질문에 정확한 현지 시간 정보를 제공하기 위해 사용합니다.
  - 타임존을 고려한 응답과 일정 안내 시 유용합니다.

### 4.2 `createTodo`

- 종류: OpenAI function tool
- 파일: `tools/todo/createTodo.ts`
- 역할: 새로운 할 일을 생성합니다.
- 설명:
  - `todo_name`, `todo_content`, `todo_description`, 일정, 상태, `group_id` 등을 받아 `todos` 테이블에 추가합니다.
  - `project_id`와 `project_page_id`는 선택적으로 저장합니다.
- 만든 이유:
  - AI가 실제로 사용자 대신 할 일을 등록해주는 생산성 기능을 지원하기 위해서입니다.
  - 사용자가 "할 일 추가해줘" 같은 요청을 했을 때 DB에 직접 생성할 수 있습니다.

---

## 5. 도구 사용 기준

- `getChatHistory` / `getChatMemory`:
  - 채팅 맥락을 확장하거나 과거 정보를 확인해야 할 때 사용합니다.
- `crawlUrl` / `fetchYoutube`:
  - 외부 링크 기반 정보가 필요할 때 호출합니다.
- `getEmoji`:
  - 감정 표현, 이모티콘 추천, 유저가 보낸 이모티콘 확인이 필요할 때 사용합니다.
- `getFileUrl`:
  - 유저 첨부 이미지나 파일을 AI가 접근해야 할 때 사용합니다.
- `getCurrentTime`:
  - 현재 시각, 지역 시각, 타임존 관련 응답이 필요할 때 사용합니다.
- `createTodo`:
  - 대화에서 할 일 생성 요청이 명확하게 있을 때 사용합니다.

---

## 6. 주의 사항

- `tools/user/getUserInfo.ts`는 현재 `ai_chat-chat`의 `agent.ts`에 import되지 않았습니다.
- `tools/todo/getUserGroups.ts`는 tool이 아니라 `buildContext`에서 초기 그룹 정보를 가져오기 위해 사용되는 컨텍스트 헬퍼입니다.

---

## 7. 참고 파일

- `supabase/functions/ai_chat-chat/agent/agent.ts`
- `supabase/functions/ai_chat-chat/tools/chat/getChatHistory.ts`
- `supabase/functions/ai_chat-chat/tools/chat/getChatMemory.ts`
- `supabase/functions/ai_chat-chat/tools/crawl/crawlUrl.ts`
- `supabase/functions/ai_chat-chat/tools/crawl/Fetchyoutube.ts`
- `supabase/functions/ai_chat-chat/tools/emoji/getEmoji.ts`
- `supabase/functions/ai_chat-chat/tools/file/getFileUrl.ts`
- `supabase/functions/ai_chat-chat/tools/time/getCurrentTime.ts`
- `supabase/functions/ai_chat-chat/tools/todo/createTodo.ts`
