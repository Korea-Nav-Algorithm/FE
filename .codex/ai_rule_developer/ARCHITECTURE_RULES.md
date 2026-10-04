# 아키텍처 규칙 - FE

이 프로젝트는 기능 우선 계층형 아키텍처를 따른다. 책임과 의존성 방향을 반드시 분리한다.

[디렉토리 구조]
- `src/features/<feature>/pages`
- `src/features/<feature>/components`
- `src/features/<feature>/hooks`
- `src/features/<feature>/services`
- `src/features/<feature>/stores`
- `src/features/<feature>/types`
- `src/shared`

[기능 모듈 배치]
- `login`, `post`, `talk` 같은 기능/도메인 폴더를 바깥 경계로 우선한다.
- 활성 profile에서 사용하는 `controllers`, `services`, `repositories`, `schemas`, `entities`, `components`, `hooks` 같은 계층 폴더는 각 기능 폴더 안에 둔다.
- 여러 기능에서 공유하는 설정, 공통 middleware, 공통 client만 shared/core/infrastructure에 둔다.

[계층 책임]
- Presentation/API 계층은 요청 파싱, 응답 변환, 라우팅, 화면 조립만 담당한다.
- Service/Application 계층은 유스케이스 조합과 비즈니스 판단을 담당한다.
- Repository/Adapter/Infrastructure 계층은 DB 접근과 외부 시스템 접근을 담당한다.
- Entity/Domain model은 저장 또는 도메인 상태를 표현하며 public response 객체로 직접 사용하지 않는다.
- Schema/DTO/View model은 외부 계약을 표현하며 persistence model과 분리한다.

[의존성 방향]
- 의존성은 Presentation/API/UI 계층에서 Service/Application, Repository/Adapter, Infrastructure 방향으로 흐른다.
- 상위 계층은 명시적 인터페이스 또는 좁은 모듈을 통해 하위 계층을 호출한다.
- 하위 계층은 UI, HTTP 응답, request, framework 객체를 상위 계층에서 가져오지 않는다.

[프로필별 아키텍처]

### React
- 기능 경계는 `src/features/<feature>` 아래에 둔다. 예: login, post, talk.
- page는 각 기능의 라우팅 단위 화면 조립을 담당한다.
- component는 기능 내부 UI와 표시 책임을 담당하고 여러 기능에서 재사용되는 것만 shared에 둔다.
- hook은 화면 상태, 비동기 흐름, UI 유스케이스를 캡슐화한다.
- service는 API 호출과 외부 클라이언트 경계만 담당한다.
- store는 전역 상태를 담당하고 서버 응답 원본을 무분별하게 복제하지 않는다.
- 권장 흐름: Page -> Hook/Store -> Service -> API, 단 구현 위치는 같은 기능 폴더 안이다.

## 외부 연동 계층
- 외부 HTTP/SDK 연동은 client 또는 adapter 모듈 뒤에 둔다.
- Service는 비즈니스 의도를 드러내는 좁은 메서드로 adapter를 호출한다.
- Upstream DTO와 내부 DTO를 분리한다.
