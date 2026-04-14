import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRAND_BLUE = '#4F6BFF';

type ReviewScreenProps = {
  onBack?: () => void;
};

export default function ReviewScreen({ onBack }: ReviewScreenProps) {
  const [step, setStep] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  const [storeName, setStoreName] = useState('');
  const [peopleCount, setPeopleCount] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [menu, setMenu] = useState('');
  const [platform, setPlatform] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [earnedPb, setEarnedPb] = useState(0);
  const [currentPb, setCurrentPb] = useState(0);
  const [showBurningStoreModal, setShowBurningStoreModal] = useState(false);
  const [burningStoreSearch, setBurningStoreSearch] = useState('');
  const [isBurningReview, setIsBurningReview] = useState(false);
  const [selectedBurningStore, setSelectedBurningStore] = useState('');
  const burningStores = [
    { id: 'burning_1', name: '피드버거 연남점', reward: 10 },
    { id: 'burning_2', name: '피드버거 합정점', reward: 10 },
    { id: 'burning_3', name: '피드버거 홍대점', reward: 10 },
  ];

  const normalizeStoreName = (name: string) => {
    return name.replace(/\s/g, '').toLowerCase();
  };

  const getRewardPb = () => {
    if (isBurningReview && selectedBurningStore) {
      const matchedStore = burningStores.find(
        (store) => store.name === selectedBurningStore
      );

      if (matchedStore) {
        return matchedStore.reward;
      }
    }

    return 2;
  };
  const filteredBurningStores = burningStores.filter((store) =>
    store.name.toLowerCase().includes(burningStoreSearch.toLowerCase())
  );
  useEffect(() => {
    const loadSetting = async () => {
      try {
        const value = await AsyncStorage.getItem('HIDE_REVIEW_GUIDE');
        if (value === 'true') {
          setDontShowAgain(true);
          setShowForm(true);
        }
        const savedPb = await AsyncStorage.getItem('CURRENT_PB');
        if (savedPb !== null) {
          setCurrentPb(Number(savedPb));
        }
      } catch (e) {
        console.log('저장값 불러오기 실패');
      }
    };

    loadSetting();
  }, []);

  const pickImage = async (type: 'receipt' | 'photos') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      alert('사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: type === 'photos',
      selectionLimit: type === 'photos' ? 5 : 1,
    });

    if (!result.canceled) {
      if (type === 'receipt') {
        setReceiptImage(result.assets[0].uri);
      } else {
        const uris = result.assets.map((a) => a.uri);
        setPhotos((prev) => [...prev, ...uris].slice(0, 5));
      }
    }
  };

  const isFormValid = useMemo(() => {
    const hasValidStore = isBurningReview
      ? selectedBurningStore.trim().length > 0
      : storeName.trim().length > 0;

    return (
      hasValidStore &&
      peopleCount.trim().length > 0 &&
      totalPrice.trim().length > 0 &&
      menu.trim().length > 0 &&
      platform.trim().length > 0 &&
      rating !== null &&
      comment.trim().length > 0 &&
      !!receiptImage
    );
  }, [
    isBurningReview,
    selectedBurningStore,
    storeName,
    peopleCount,
    totalPrice,
    menu,
    platform,
    rating,
    comment,
    receiptImage,
  ]);

  const toggleDontShow = async () => {
    try {
      const newValue = !dontShowAgain;
      setDontShowAgain(newValue);
      await AsyncStorage.setItem(
        'HIDE_REVIEW_GUIDE',
        newValue ? 'true' : 'false'
      );
    } catch (e) {
      console.log('저장 실패');
    }
  };

  const nextStep = () => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setShowForm(true);
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

    const reward = getRewardPb();
    const nextPb = currentPb + reward;

    setEarnedPb(reward);
    setCurrentPb(nextPb);

    await AsyncStorage.setItem('CURRENT_PB', String(nextPb));

    setShowSuccess(true);
  };

  if (showSuccess) {
    return (
      <SafeAreaView style={styles.successScreen} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Text style={styles.successCircleText}>PB</Text>
          </View>

          <Text style={styles.successTitle}>PB 적립 완료!</Text>
          <Text style={styles.successRewardText}>이번 적립: +{earnedPb} PB</Text>
          <Text style={styles.successCurrentPbText}>현재 보유: {currentPb} PB</Text>
          <Text style={styles.successDesc}>
            리뷰 인증이 정상적으로 접수됐어요.{'\n'}
            검토 후 보상이 반영될 수 있어요.
          </Text>

          <View style={styles.successInfoCard}>
            <View style={styles.successInfoRow}>
              <Text style={styles.successInfoLabel}>매장명</Text>
              <Text style={styles.successInfoValue}>
                {isBurningReview ? selectedBurningStore || '-' : storeName || '-'}
              </Text>
            </View>
            <View style={styles.successInfoRow}>
              <Text style={styles.successInfoLabel}>리뷰 플랫폼</Text>
              <Text style={styles.successInfoValue}>{platform || '-'}</Text>
            </View>
            <View style={styles.successInfoRow}>
              <Text style={styles.successInfoLabel}>만족도</Text>
              <Text style={styles.successInfoValue}>
                {rating ? `${rating}점` : '-'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.successButton}
            onPress={() => onBack?.()}
          >
            <Text style={styles.successButtonText}>홈으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!showForm) {
    return (
      <SafeAreaView style={styles.overlayScreen} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.guideHeader}>
              <Text style={styles.guideTitle}>리뷰 인증 방법</Text>

              <TouchableOpacity style={styles.closeButton} onPress={onBack}>
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.progressRow}>
              {[1, 2, 3].map((item) => (
                <View
                  key={item}
                  style={[
                    styles.progressBar,
                    step >= item && styles.progressBarActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.stepCard}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>STEP {step}</Text>
              </View>

              {step === 1 && (
                <>
                  <Text style={styles.stepTitle}>
                    매장 방문 후{'\n'}
                    리뷰를 작성해 주세요
                  </Text>

                  <View style={styles.pbCircle}>
                    <Text style={styles.pbCircleText}>PB</Text>
                  </View>

                  <View style={styles.tipBox}>
                    <Text style={styles.tipText}>
                      <Text style={styles.tipStrong}>TIP!</Text> “PEED” 문구로
                      리뷰를 시작하면 인증이 더 쉬워져요.
                    </Text>
                  </View>
                </>
              )}

              {step === 2 && (
                <>
                  <Text style={styles.stepTitle}>
                    리뷰 화면을{'\n'}
                    스크린샷으로 찍어주세요
                  </Text>

                  <View style={styles.pbCircle}>
                    <Text style={styles.pbCircleText}>PB</Text>
                  </View>

                  <View style={styles.tipBox}>
                    <Text style={styles.tipText}>
                      <Text style={styles.tipStrong}>TIP!</Text> 모바일/PC 어떤
                      플랫폼이든 스크린샷이면 가능해요.
                    </Text>
                  </View>
                </>
              )}

              {step === 3 && (
                <>
                  <Text style={styles.stepTitle}>
                    앱에 인증하면{'\n'}
                    PB 즉시 지급!
                  </Text>

                  <View style={styles.pbCircle}>
                    <Text style={styles.pbCircleText}>PB</Text>
                  </View>

                  <View style={styles.tipBox}>
                    <Text style={styles.tipText}>
                      <Text style={styles.tipStrong}>TIP!</Text> 매장명은 네이버플레이스 기준으로 입력해 주세요.{'\n'}
                      예: 피드버거 연남점
                    </Text>
                  </View>
                </>
              )}
            </View>

            {step === 3 && (
              <>
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠ 부정 인증, 중복/허위 리뷰는 검토 후 지급 취소 또는 이용
                    제한될 수 있어요.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={toggleDontShow}
                >
                  <View
                    style={[
                      styles.checkbox,
                      dontShowAgain && styles.checkboxActive,
                    ]}
                  >
                    {dontShowAgain && (
                      <Text style={styles.checkboxMark}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>다시 보지 않기</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.guideBottomRow}>
              {step > 1 ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={prevStep}
                >
                  <Text style={styles.secondaryButtonText}>이전</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.singleSpacer} />
              )}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={nextStep}
              >
                <Text style={styles.primaryButtonText}>
                  {step < 3 ? '다음' : '인증하러 가기'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {showBurningStoreModal && (
        <View style={styles.burningModalOverlay}>
          <View style={styles.burningModalCard}>
            <View style={styles.burningModalHeader}>
              <Text style={styles.burningModalTitle}>버닝 매장 선택</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setShowBurningStoreModal(false);
                  setBurningStoreSearch('');
                }}
              >
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.burningSearchInput}
              placeholder="버닝 매장 검색"
              placeholderTextColor="#9CA3AF"
              value={burningStoreSearch}
              onChangeText={setBurningStoreSearch}
            />

            <ScrollView
              style={styles.burningModalList}
              showsVerticalScrollIndicator={false}
            >
              {filteredBurningStores.length > 0 ? (
                filteredBurningStores.map((store) => {
                  const selected = selectedBurningStore === store.name;

                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[
                        styles.burningModalItem,
                        selected && styles.burningModalItemActive,
                      ]}
                      onPress={() => {
                        setSelectedBurningStore(store.name);
                        setShowBurningStoreModal(false);
                        setBurningStoreSearch('');
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.burningModalItemName,
                            selected && styles.burningModalItemNameActive,
                          ]}
                        >
                          {store.name}
                        </Text>
                        <Text
                          style={[
                            styles.burningModalItemReward,
                            selected && styles.burningModalItemRewardActive,
                          ]}
                        >
                          버닝 매장 · {store.reward}PB 지급
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.burningEmptyBox}>
                  <Text style={styles.burningEmptyText}>검색 결과가 없어요</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.formWrap}
        contentContainerStyle={styles.formContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formHeaderRow}>
          <Text style={styles.formHeaderTitle}>리뷰 인증</Text>

          <TouchableOpacity style={styles.closeButton} onPress={onBack}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroEyebrow}>REVIEW CHECK</Text>
            <Text style={styles.heroTitle}>
              리뷰 정보 입력하고{'\n'}
              PB 적립
            </Text>
          </View>

          <View style={styles.heroPb}>
            <Text style={styles.heroPbText}>PB</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>기본 정보</Text>
          </View>

          <Text style={styles.label}>리뷰 인증 유형</Text>

          <View style={styles.reviewTypeRow}>
            <TouchableOpacity
              style={[
                styles.reviewTypeButton,
                !isBurningReview && styles.reviewTypeButtonActive,
              ]}
              onPress={() => {
                setIsBurningReview(false);
                setSelectedBurningStore('');
                setBurningStoreSearch('');
                setShowBurningStoreModal(false);
              }}
            >
              <Text
                style={[
                  styles.reviewTypeButtonText,
                  !isBurningReview && styles.reviewTypeButtonTextActive,
                ]}
              >
                일반 리뷰 인증
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.reviewTypeButton,
                isBurningReview && styles.reviewTypeButtonActive,
              ]}
              onPress={() => {
                setIsBurningReview(true);
                setStoreName('');
                setBurningStoreSearch('');
              }}
            >
              <Text
                style={[
                  styles.reviewTypeButtonText,
                  isBurningReview && styles.reviewTypeButtonTextActive,
                ]}
              >
                버닝 매장 리뷰 인증하기
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>
            {isBurningReview ? '버닝 매장 선택' : '매장명 / 상품명'}
          </Text>

          {isBurningReview ? (
            <>
              <TouchableOpacity
                style={styles.burningSelectButton}
                onPress={() => setShowBurningStoreModal(true)}
              >
                <Text
                  style={[
                    styles.burningSelectButtonText,
                    selectedBurningStore && styles.burningSelectButtonTextActive,
                  ]}
                >
                  {selectedBurningStore || '등록된 버닝 매장 선택하기'}
                </Text>
                <Text style={styles.burningSelectArrow}>⌵</Text>
              </TouchableOpacity>

              <Text style={styles.helperText}>
                버닝 매장은 직접 입력할 수 없고, 등록된 매장만 선택할 수 있어요
              </Text>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="예: 피드버거 연남점"
                placeholderTextColor="#9CA3AF"
                value={storeName}
                onChangeText={setStoreName}
              />
              <Text style={styles.helperText}>
                네이버플레이스 기준 매장명 + 지점명을 입력해 주세요
              </Text>
            </>
          )}

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>인원</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 2명"
                placeholderTextColor="#9CA3AF"
                value={peopleCount}
                onChangeText={setPeopleCount}
              />
            </View>

            <View style={styles.half}>
              <Text style={styles.label}>총 금액</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 42,000원"
                placeholderTextColor="#9CA3AF"
                value={totalPrice}
                onChangeText={setTotalPrice}
              />
            </View>
          </View>

          <Text style={styles.label}>주문 메뉴</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 파스타, 하이볼 2잔"
            placeholderTextColor="#9CA3AF"
            value={menu}
            onChangeText={setMenu}
          />

          <Text style={styles.label}>리뷰 플랫폼</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 네이버 / 카카오맵 / 구글"
            placeholderTextColor="#9CA3AF"
            value={platform}
            onChangeText={setPlatform}
          />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>리뷰 내용</Text>
          </View>

          <Text style={styles.label}>만족도</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((score) => (
              <TouchableOpacity
                key={score}
                style={[
                  styles.ratingButton,
                  rating === score && styles.ratingButtonActive,
                ]}
                onPress={() => setRating(score)}
              >
                <Text
                  style={[
                    styles.ratingButtonText,
                    rating === score && styles.ratingButtonTextActive,
                  ]}
                >
                  {score}점
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>한줄 코멘트</Text>
          <TextInput
            style={styles.textarea}
            placeholder="분위기가 좋고 음식이 빨리 나왔어요."
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            value={comment}
            onChangeText={setComment}
          />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>리뷰 인증</Text>
          </View>

          <Text style={styles.label}>영수증 리뷰 사진</Text>
          <TouchableOpacity
            style={styles.uploadBox}
            onPress={() => pickImage('receipt')}
          >
            {receiptImage ? (
              <Image source={{ uri: receiptImage }} style={styles.previewImage} />
            ) : (
              <>
                <View style={styles.uploadPb}>
                  <Text style={styles.uploadPbText}>PB</Text>
                </View>
                <Text style={styles.uploadTitle}>영수증 리뷰 사진 올리기</Text>
                <Text style={styles.uploadDesc}>1장만 업로드해 주세요</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>이용 사진</Text>
          <TouchableOpacity
            style={styles.uploadBox}
            onPress={() => pickImage('photos')}
          >
            <View style={styles.uploadPb}>
              <Text style={styles.uploadPbText}>PB</Text>
            </View>
            <Text style={styles.uploadTitle}>이용 사진 올리기</Text>
            <Text style={styles.uploadDesc}>최대 5장 · 마이피드에 저장</Text>

            {photos.length > 0 && (
              <View style={styles.previewRow}>
                {photos.map((uri, index) => (
                  <Image
                    key={index}
                    source={{ uri }}
                    style={styles.smallPreview}
                  />
                ))}
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.bottomButtonRow}>
          <TouchableOpacity
            style={styles.bottomSecondaryButton}
            onPress={onBack}
          >
            <Text style={styles.bottomSecondaryButtonText}>뒤로가기</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.bottomPrimaryButton,
              !isFormValid && styles.bottomPrimaryButtonDisabled,
            ]}
            disabled={!isFormValid}
            onPress={handleSubmit}
          >
            <Text
              style={[
                styles.bottomPrimaryButtonText,
                !isFormValid && styles.bottomPrimaryButtonTextDisabled,
              ]}
            >
              PB 적립 받기
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  reviewTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },

  reviewTypeButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
  },

  reviewTypeButtonActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },

  reviewTypeButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },

  reviewTypeButtonTextActive: {
    color: BRAND_BLUE,
  },

  burningStoreList: {
    gap: 10,
  },

  burningStoreItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  burningStoreItemActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },

  burningStoreName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },

  burningStoreNameActive: {
    color: BRAND_BLUE,
  },

  burningStoreReward: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },

  burningStoreRewardActive: {
    color: BRAND_BLUE,
  },
  successCurrentPbText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  overlayScreen: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.18)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  guideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  guideTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 20,
    color: '#6B7280',
    marginTop: -2,
  },

  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  progressBarActive: {
    backgroundColor: BRAND_BLUE,
  },

  stepCard: {
    backgroundColor: '#F8FAFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND_BLUE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 16,
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 24,
  },

  pbCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    shadowColor: '#4F6BFF',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pbCircleText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },

  tipBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tipText: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  tipStrong: {
    color: BRAND_BLUE,
    fontWeight: '800',
  },

  warningBox: {
    marginTop: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  warningText: {
    color: '#DC2626',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  checkboxLabel: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },

  guideBottomRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  singleSpacer: {
    flex: 1,
  },
  secondaryButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1.2,
    height: 56,
    borderRadius: 18,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  formWrap: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  formContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 16,
  },
  formHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formHeaderTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },

  heroCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroEyebrow: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  heroTitle: {
    color: '#111827',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
  },
  heroPb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPbText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 20,
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    gap: 12,
  },
  sectionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 4,
  },
  sectionBadgeText: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '800',
  },
  label: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  input: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    color: '#111827',
    fontSize: 15,
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  ratingButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingButtonActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  ratingButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  ratingButtonTextActive: {
    color: BRAND_BLUE,
  },
  textarea: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#111827',
    fontSize: 15,
  },

  uploadBox: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFF',
    paddingVertical: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  uploadPb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadPbText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  uploadTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  uploadDesc: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  previewImage: {
    width: '100%',
    height: 150,
    borderRadius: 16,
  },
  previewRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  smallPreview: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginHorizontal: 4,
    marginTop: 6,
  },

  bottomButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  bottomSecondaryButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSecondaryButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  bottomPrimaryButton: {
    flex: 1.4,
    height: 56,
    borderRadius: 18,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomPrimaryButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  bottomPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  bottomPrimaryButtonTextDisabled: {
    color: '#9CA3AF',
  },

  successScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  successWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    shadowColor: '#4F6BFF',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  successCircleText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  successTitle: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  successDesc: {
    color: '#6B7280',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 28,
  },
  successInfoCard: {
    backgroundColor: '#F8FAFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    padding: 18,
    marginBottom: 28,
    gap: 12,
  },
  successInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  successInfoLabel: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  successInfoValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  successButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  successRewardText: {
    color: BRAND_BLUE,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  currentPbText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  burningSelectButton: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  burningSelectButtonText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
  },

  burningSelectButtonTextActive: {
    color: '#111827',
    fontWeight: '800',
  },

  burningSelectArrow: {
    color: '#6B7280',
    fontSize: 18,
    fontWeight: '800',
  },

  burningModalOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.25)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 30,
  },

  burningModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  burningModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  burningModalTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },

  burningSearchInput: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    color: '#111827',
    fontSize: 15,
    marginBottom: 14,
  },

  burningModalList: {
    maxHeight: 340,
  },

  burningModalItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },

  burningModalItemActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },

  burningModalItemName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },

  burningModalItemNameActive: {
    color: BRAND_BLUE,
  },

  burningModalItemReward: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },

  burningModalItemRewardActive: {
    color: BRAND_BLUE,
  },

  burningEmptyBox: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  burningEmptyText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
});

