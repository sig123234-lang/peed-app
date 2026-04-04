import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Image,
  } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  
  const BRAND_BLUE = '#4F6BFF';
  
  export default function StoreDetail({ onClose }: any) {
    return (
      <SafeAreaView style={styles.container}>
        
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>매장 정보</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>×</Text>
          </TouchableOpacity>
        </View>
  
        <ScrollView>
  
          {/* 이미지 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4' }}
              style={styles.image}
            />
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1559339352-11d035aa65de' }}
              style={styles.image}
            />
          </ScrollView>
  
          {/* 매장 카드 */}
          <View style={styles.card}>
            <View style={styles.row}>
              <View>
                <Text style={styles.storeName}>샤월의주방</Text>
                <Text style={styles.category}>요리주점</Text>
              </View>
  
              <View style={styles.pb}>
                <Text style={styles.pbText}>+10 PB</Text>
              </View>
            </View>
  
            <Text style={styles.address}>
              📍 서울 마포구 와우산로21길 19 2층
            </Text>
          </View>
  
          {/* 상세 정보 */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>매장 정보</Text>
  
            <Info label="주소" value="서울 마포구 와우산로21길 19 2층" />
            <Info label="영업시간" value="매일 17:00 - 02:00" />
            <Info label="전화번호" value="02-000-0000" />
            <Info label="대표메뉴" value="트러플 파스타, 하이볼, 감바스" />
            <Info label="편의" value="예약, 포장, 단체 이용 가능" />
          </View>
  
          <View style={{ height: 100 }} />
        </ScrollView>
  
        {/* 하단 버튼 */}
        <View style={styles.bottom}>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>
              네이버 플레이스에서 확인하기
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  function Info({ label, value }: any) {
    return (
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    );
  }
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#FFFFFF', // ✅ 흰색
    },
  
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 20,
    },
  
    headerTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#111',
    },
  
    close: {
      fontSize: 24,
      color: '#999',
    },
  
    image: {
      width: 260,
      height: 180,
      borderRadius: 16,
      marginLeft: 16,
    },
  
    card: {
      backgroundColor: '#FFFFFF',
      margin: 16,
      padding: 18,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
  
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  
    storeName: {
      fontSize: 22,
      fontWeight: '800',
      color: '#111',
    },
  
    category: {
      color: '#6B7280',
      marginTop: 4,
    },
  
    pb: {
      backgroundColor: '#EEF2FF',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
  
    pbText: {
      color: BRAND_BLUE,
      fontWeight: '800',
    },
  
    address: {
      marginTop: 12,
      color: '#6B7280',
    },
  
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 10,
      color: BRAND_BLUE,
    },
  
    infoRow: {
      marginBottom: 14,
    },
  
    infoLabel: {
      color: '#9CA3AF',
      fontSize: 13,
      marginBottom: 4,
    },
  
    infoValue: {
      color: '#111',
      fontWeight: '600',
    },
  
    bottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      backgroundColor: '#fff',
    },
  
    button: {
      height: 55,
      borderRadius: 16,
      backgroundColor: BRAND_BLUE,
      justifyContent: 'center',
      alignItems: 'center',
    },
  
    buttonText: {
      color: '#fff',
      fontWeight: '800',
    },
  });