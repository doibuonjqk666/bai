/**
 * SCRIPT HOÀN THÀNH VIDEO COURSERA v5.1 (Tích hợp Dual API Call)
 * Tác giả: Dựa trên nghiên cứu của cộng đồng.
 * Ngày cập nhật: 21/10/2025
 *
 * TÍNH NĂNG:
 * - Sử dụng API onDemandVideoProgresses.v1 để cập nhật tiến độ video (chính).
 * - Gửi thêm yêu cầu 'ended' qua API opencourse.v1 để tăng tính tương thích (phụ).
 * - Tự động tìm videoId bằng 2 phương pháp:
 * 1. API Course Materials (nhanh, cho các video thông thường).
 * 2. API Lecture Videos (dự phòng, cho các video đặc biệt hoặc bài tập có video).
 * - Tự động lấy tất cả thông tin cần thiết (userId, courseId, lectureId).
 * - Cung cấp log chi tiết trên Console để dễ dàng theo dõi.
 *
 * CÁCH CHẠY:
 * 1. Mở trang bài giảng video trên Coursera.
 * 2. Mở Developer Tools (F12 hoặc Ctrl+Shift+I).
 * 3. Chuyển sang tab "Console".
 * 4. Dán toàn bộ script này vào và nhấn Enter.
 * 5. Gõ lệnh sau và nhấn Enter:
 * await markCurrentVideoAsComplete()
 */

// ===================== HELPER FUNCTIONS =====================

function getUserId() {
    // 1. Ưu tiên từ script tag
    const scriptTag = document.querySelector('body > script:nth-child(3)');
    if (scriptTag && scriptTag.textContent) {
        const match = scriptTag.textContent.match(/(\d+~[A-Za-z0-9-_]+)/);
        if (match && match[1]) return match[1].split('~')[0];
    }

    // 2. Từ header link
    const headerLink = document.querySelector('[data-testid="page-header-wrapper"] a[data-track-app="open_course_home"]');
    if (headerLink) {
        const clickValue = headerLink.getAttribute('data-click-value');
        if (clickValue) {
            try {
                const parsed = JSON.parse(clickValue);
                if (parsed.userId) return parsed.userId.toString();
            } catch (e) { /* Bỏ qua lỗi parsing */ }
        }
    }

    // 3. Fallback: nhập tay
    const manual = prompt("Không tự động lấy được User ID.\n\nNhập thủ công (chỉ số, ví dụ: 182559818):");
    if (manual && /^\d+$/.test(manual.trim())) {
        return manual.trim();
    }

    throw new Error("Không thể lấy được User ID. Script dừng lại.");
}

function getCourseContextFromUrl() {
    const match = window.location.pathname.match(/\/learn\/([^/]+)\/lecture\/([^/]+)/);
    if (!match) throw new Error("URL không hợp lệ. Hãy chắc chắn bạn đang ở trên một trang bài giảng (lecture).");
    return { courseSlug: match[1], lectureId: match[2] };
}

async function getCourseId(slug) {
    const url = `https://www.coursera.org/api/onDemandCourses.v1?q=slug&slug=${slug}&fields=id`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Lỗi khi lấy courseId: ${res.status}`);
    const data = await res.json();
    const course = data.elements?.[0];
    if (!course?.id) throw new Error("Không tìm thấy ID khóa học từ API.");
    return course.id;
}

// ===================== VIDEO INFO FINDERS (Primary & Fallback) =====================

/**
 * [Cách 1] Lấy videoId từ API Course Materials.
 */
async function _getVideoInfoFromMaterials(courseSlug, lectureId) {
    const url = `https://www.coursera.org/api/onDemandCourseMaterials.v2/?q=slug&slug=${courseSlug}&includes=items&fields=onDemandCourseMaterialItems.v2(name,slug,contentSummary,assetSummary)`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Lỗi API Materials: ${res.status}`);
    const data = await res.json();
    const items = data?.linked?.['onDemandCourseMaterialItems.v2'];
    if (!items) throw new Error("Không có dữ liệu bài học trong API Materials.");

    const item = items.find(i => i.id === lectureId);
    if (!item) throw new Error(`Không tìm thấy item '${lectureId}' trong API Materials.`);
    if (item.contentSummary?.typeName !== 'lecture') throw new Error("Item không phải là một bài giảng video.");

    const def = item.assetSummary?.definition;
    if (!def?.videoId) throw new Error("Item này không chứa videoId trong API Materials.");

    return {
        videoId: def.videoId,
        duration: def.duration || 300000 // duration tính bằng mili-giây
    };
}

/**
 * [Cách 2 - Fallback] Lấy videoId từ API Lecture Videos.
 */
async function _getVideoInfoFromLectureApi(courseId, lectureId) {
    const url = `https://www.coursera.org/api/onDemandLectureVideos.v1/${courseId}~${lectureId}?includes=video&fields=onDemandVideos.v1(id)`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Lỗi API Lecture: ${res.status}`);
    const data = await res.json();
    const videoId = data?.linked?.['onDemandVideos.v1']?.[0]?.id;

    if (!videoId) {
        throw new Error("Không tìm thấy videoId trong API Lecture.");
    }

    return {
        videoId: videoId,
        duration: 300000 // API này không trả về duration, ta dùng giá trị mặc định
    };
}

/**
 * Hàm tổng hợp: Thử cách 1, nếu thất bại thì thử cách 2.
 */
async function getVideoInfo_V5(courseSlug, lectureId, courseId) {
    try {
        console.log("-> Thử cách 1: Lấy thông tin từ Course Materials API...");
        const videoInfo = await _getVideoInfoFromMaterials(courseSlug, lectureId);
        console.log("   Thành công bằng cách 1!");
        return videoInfo;
    } catch (error) {
        console.warn(`   Cách 1 thất bại: ${error.message}`);
        console.log("-> Thử cách 2 (Fallback): Lấy thông tin từ Lecture Videos API...");
        try {
            const videoInfo = await _getVideoInfoFromLectureApi(courseId, lectureId);
            console.log("   Thành công bằng cách 2!");
            return videoInfo;
        } catch (fallbackError) {
             console.error(`   Cách 2 cũng thất bại: ${fallbackError.message}`);
             throw new Error("Không thể tìm thấy videoId bằng cả hai cách. Đây có thể là bài đọc thuần túy hoặc quiz.");
        }
    }
}


// ===================== CORE ACTIONS =====================

/**
 * [Hành động chính] Gửi yêu cầu PUT để cập nhật tiến độ video.
 */
async function completeVideo(userId, courseId, videoId, duration) {
    const videoProgressId = `${userId}~${courseId}~${videoId}`;
    const url = `https://www.coursera.org/api/onDemandVideoProgresses.v1/${videoProgressId}`;

    const csrfCookie = document.cookie.match(/CSRF3-Token=([^;]+)/) || document.cookie.match(/csrftoken=([^;]+)/);
    const csrfToken = csrfCookie ? csrfCookie[1] : '';
    if (!csrfToken) throw new Error("Không tìm thấy CSRF token. Bạn đã đăng nhập chưa?");

    const headers = {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'x-coursera-application': 'ondemand'
    };
    if (document.cookie.includes('CSRF3-Token=')) {
        headers['x-csrf3-token'] = csrfToken;
    } else {
        headers['x-csrftoken'] = csrfToken;
    }

    const res = await fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({
            viewedUpTo: duration,
            videoProgressId: videoProgressId
        }),
        credentials: 'include'
    });
    
    if (res.status === 204 || res.ok) {
        return true;
    } else {
        console.error("Phản hồi lỗi từ server (PUT request):", res);
        const errorBody = await res.text();
        console.error("Nội dung lỗi:", errorBody);
        return false;
    }
}

/**
 * [Hành động phụ] Gửi yêu cầu POST để đánh dấu sự kiện 'ended'.
 */
async function markLectureAsEnded(userId, courseSlug, lectureId) {
    const apiUrl = `https://www.coursera.org/api/opencourse.v1/user/${userId}/course/${courseSlug}/item/${lectureId}/lecture/videoEvents/ended?autoEnroll=false`;
    
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'x-coursera-application': 'ondemand',
                'x-requested-with': 'XMLHttpRequest'
            },
            body: JSON.stringify({ contentRequestBody: {} }),
            credentials: "include"
        });

        if (response.ok) {
            console.log("   -> Yêu cầu bổ sung 'ended' thành công.");
        } else {
            console.warn(`   -> Yêu cầu bổ sung 'ended' không thành công (Status: ${response.status}). Điều này có thể không ảnh hưởng đến kết quả cuối cùng.`);
        }
    } catch (error) {
        console.warn(`   -> Lỗi khi gửi yêu cầu 'ended': ${error.message}`);
    }
}


// ===================== MAIN FUNCTION =====================
async function markCurrentVideoAsComplete() {
    try {
        console.clear();
        console.log("%c🚀 BẮT ĐẦU SCRIPT HOÀN THÀNH VIDEO v5.1 🚀", "color: #8A2BE2; font-weight: bold; font-size: 16px");

        // 1. Lấy thông tin cơ bản
        const userId = getUserId();
        const { courseSlug, lectureId } = getCourseContextFromUrl();
        console.log(`- User ID: ${userId}`);
        console.log(`- Khóa học Slug: ${courseSlug}`);
        console.log(`- Bài giảng ID: ${lectureId}`);

        // 2. Lấy Course ID nội bộ
        console.log("Đang lấy Course ID...");
        const courseId = await getCourseId(courseSlug);
        console.log(`- Course ID: ${courseId}`);

        // 3. Lấy Video ID và Duration bằng phương pháp tổng hợp
        console.log("Đang lấy thông tin video...");
        const { videoId, duration } = await getVideoInfo_V5(courseSlug, lectureId, courseId);
        console.log(`- Video ID: ${videoId}`);
        console.log(`- Thời lượng (ms): ${duration}`);

        // 4. Gửi yêu cầu hoàn thành chính (PUT)
        console.log("Đang gửi yêu cầu hoàn thành chính (PUT)...");
        const success = await completeVideo(userId, courseId, videoId, duration);

        if (success) {
            // 5. Gửi yêu cầu hoàn thành phụ (POST)
            console.log("Đang gửi yêu cầu hoàn thành bổ sung (POST)...");
            await markLectureAsEnded(userId, courseSlug, lectureId);

            console.log("%c✅ THÀNH CÔNG! Video đã được đánh dấu là hoàn thành.", "color: #00d26a; font-weight: bold; font-size: 18px");
            console.log("   -> Vui lòng TẢI LẠI TRANG (F5) để thấy dấu tích xanh.");
        } else {
            throw new Error("Gửi yêu cầu hoàn thành chính (PUT) thất bại. Kiểm tra log lỗi ở trên.");
        }

    } catch (error) {
        console.error("%c❌ ĐÃ XẢY RA LỖI:", "color: red; font-weight: bold; font-size: 16px", error.message);
        console.log("   -> Gợi ý: Kiểm tra lại bạn đã đăng nhập, đang ở đúng trang video, và không có tiện ích nào chặn cookie/request.");
    }
}

// Hướng dẫn sử dụng
console.log(`
SCRIPT ĐÃ SẴN SÀNG! (v5.1 - Tích hợp Dual API Call)
1. Đảm bảo bạn đang ở đúng trang bài giảng có video.
2. Gõ lệnh sau vào console và nhấn Enter:
`);
console.log("%c   await markCurrentVideoAsComplete()", "background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-family: monospace;");

