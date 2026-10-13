# 서재 (Seojae) · Premium Reading App

세련된 프리미엄 독서 웹 앱입니다. PWA로 제작되어 오프라인에서도 작동하며, 홈 화면에 설치할 수 있습니다.

## 주요 기능

- **지원 포맷**: TXT, DOCX, PDF, EPUB, MD, HTML
- **TXT 인코딩**: UTF-8, CP949(EUC-KR), ANSI 자동 감지
- **서재**: 열어본 책을 저장하고, 이어읽기 / 책갈피 / 개별 삭제
- **목차**: 한글 소설·문서 패턴 인식 + 목차 없는 파일용 임의 목차 생성
- **읽기 설정**: 글꼴, 크기, 자간, 줄간격, 본문 너비, 라이트/세피아/나이트 모드
- **TTS**: 시스템 음성 읽어주기 (Web Speech API)
- **UI**: 아일랜드 바 형태의 아이콘 메뉴 + 자동 숨김
- **PWA**: 오프라인 지원, 홈 화면 추가 가능

## GitHub Pages 배포 방법

1. 이 폴더 전체를 GitHub 저장소에 업로드합니다.
2. 저장소 **Settings → Pages** 에서 Source를 `Deploy from a branch`로 설정하고 `main` (또는 `master`) 브랜치의 `/ (root)`를 선택합니다.
3. 몇 분 후 `https://<username>.github.io/<repo-name>/` 으로 접속할 수 있습니다.
4. 모바일 브라우저에서 **홈 화면에 추가**하면 앱처럼 사용할 수 있습니다.

## 로컬 실행

단순 정적 파일이므로 아무 정적 서버로 실행하면 됩니다.

```bash
# Python
python -m http.server 8080

# 또는 Node
npx serve .
```

브라우저에서 `http://localhost:8080` 접속.

> 참고: `file://` 프로토콜에서는 Service Worker와 일부 API가 제한될 수 있으므로 로컬 서버 사용을 권장합니다.

## 기술 스택

- Vanilla HTML / CSS / JavaScript
- IndexedDB (책 데이터 & 진행률 저장)
- mammoth.js (DOCX)
- JSZip (EPUB)
- marked (Markdown)
- pdf.js (PDF)
- Web Speech API (TTS)
- Service Worker + Web App Manifest (PWA)

## 라이선스

개인·비상업적 사용 자유롭게 가능합니다.
