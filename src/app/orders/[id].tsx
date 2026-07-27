import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Modal, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { orders } from '../../shared/database/schema';
import { eq } from 'drizzle-orm';
import { syncQueueService } from '../../shared/services/syncQueueService';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { 
  ArrowLeft, Phone, Mail, MessageSquare, MapPin, Copy, 
  Printer, Share2, AlertCircle, CheckCircle, ChevronDown, ShoppingBag, CreditCard
} from 'lucide-react-native';
import { getCurrencySymbol } from '../../shared/store/settingsStore';

const ALL_STATUSES = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];

export default function OrderDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const orderId = Number(id);

  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState<any | null>(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Retrieve cached order details from SQLite
  useEffect(() => {
    if (!id || isNaN(orderId)) {
      return;
    }

    try {
      const res = sqlite.getAllSync<any>(
        `SELECT id, number, status, currency, date_created as dateCreated, total, billing, shipping, line_items as lineItems, discount_total as discountTotal, shipping_total as shippingTotal, payment_method_title as paymentMethodTitle 
         FROM orders 
         WHERE id = ? LIMIT 1`,
         orderId
      );

      if (res && res.length > 0) {
        const row = res[0];
        
        let billingObj = {};
        let shippingObj = {};
        let itemsList = [];

        try { billingObj = row.billing ? JSON.parse(row.billing) : {}; } catch {}
        try { shippingObj = row.shipping ? JSON.parse(row.shipping) : {}; } catch {}
        try { itemsList = row.lineItems ? JSON.parse(row.lineItems) : []; } catch {}

        setOrderData({
          id: row.id,
          number: row.number,
          status: row.status,
          currency: row.currency || 'USD',
          dateCreated: row.dateCreated,
          total: row.total,
          billing: billingObj,
          shipping: shippingObj,
          lineItems: itemsList,
          discountTotal: row.discountTotal || '0.00',
          shippingTotal: row.shippingTotal || '0.00',
          paymentMethodTitle: row.paymentMethodTitle || 'Standard Payment',
        });
      } else {
        Alert.alert('Error', 'Order not found in local cache.');
        router.back();
      }
    } catch (err) {
      console.error('Failed to load order:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId, id]);

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!orderData) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 justify-center items-center p-6">
        <AlertCircle size={40} color="#EF4444" />
        <Text className="text-red-400 text-sm font-bold mt-4">Order Not Found</Text>
        <Pressable 
          onPress={() => router.back()} 
          className="mt-6 bg-white border border-slate-200 px-6 py-2.5 rounded-xl active:bg-slate-150"
        >
          <Text className="text-slate-900 font-bold text-xs">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const { billing, shipping, lineItems } = orderData;

  // 1. Contact Customer Helpers
  const handleCall = () => {
    if (billing?.phone) {
      Linking.openURL(`tel:${billing.phone}`);
    } else {
      Alert.alert('Missing Info', 'No phone number available for this billing profile.');
    }
  };

  const handleWhatsApp = () => {
    if (billing?.phone) {
      const cleanPhone = billing.phone.replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}`);
    } else {
      Alert.alert('Missing Info', 'No phone number available.');
    }
  };

  const handleEmail = () => {
    if (billing?.email) {
      Linking.openURL(`mailto:${billing.email}?subject=Updates regarding Order #${orderData.number}`);
    } else {
      Alert.alert('Missing Info', 'No email address available.');
    }
  };

  // 2. Maps & Copy Helpers
  const handleCopyAddress = (type: 'billing' | 'shipping') => {
    const addr = type === 'billing' ? billing : shipping;
    const text = `${addr.first_name || ''} ${addr.last_name || ''}\n${addr.address_1 || ''} ${addr.address_2 || ''}\n${addr.city || ''}, ${addr.state || ''} ${addr.postcode || ''}\n${addr.country || ''}`;
    Clipboard.setString(text);
    Alert.alert('Copied', 'Address copied to clipboard!');
  };

  const handleNavigate = () => {
    const query = encodeURIComponent(
      `${shipping.address_1 || ''}, ${shipping.city || ''}, ${shipping.state || ''}, ${shipping.postcode || ''}, ${shipping.country || ''}`
    );
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  // 3. Status updates (Local optimistic update + queue back sync)
  const handleStatusChange = async (newStatus: string) => {
    setStatusModalVisible(false);
    setUpdating(true);

    try {
      // Update SQLite local record
      sqlite.runSync(
        `UPDATE orders SET status = ?, last_updated = ? WHERE id = ?`,
        newStatus, Date.now(), orderId
      );

      // Queue background API update
      await syncQueueService.enqueue('UPDATE_ORDER', {
        id: orderId,
        status: newStatus,
      });

      // Update active state
      setOrderData((prev: any) => ({ ...prev, status: newStatus }));

      // Trigger sync
      syncQueueService.processQueue().catch(() => {});

      Alert.alert('Success', `Status updated to "${newStatus}" locally.`);
    } catch (err) {
      console.error('Failed to change status:', err);
      Alert.alert('Error', 'Failed to update order status.');
    } finally {
      setUpdating(false);
    }
  };

  // 4. PDF Invoice Printing/Sharing
  const generateInvoiceHtml = () => {
    const itemsRows = lineItems.map((item: any) => `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 0; font-size: 13px;">${item.name}</td>
        <td style="padding: 10px 0; text-align: center; font-size: 13px;">${item.quantity}</td>
        <td style="padding: 10px 0; text-align: right; font-size: 13px;">$${Number(item.price).toFixed(2)}</td>
        <td style="padding: 10px 0; text-align: right; font-size: 13px; font-weight: bold;">$${Number(item.total).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1E293B; padding: 24px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #3B82F6; padding-bottom: 16px; margin-bottom: 24px; }
            .title { font-size: 24px; font-weight: bold; color: #1E293B; }
            .meta { font-size: 12px; text-align: right; color: #64748B; line-height: 1.5; }
            .grid { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 40px; }
            .col { flex: 1; font-size: 12px; line-height: 1.6; }
            .col-title { font-weight: bold; font-size: 13px; text-transform: uppercase; color: #475569; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { text-align: left; padding: 8px 0; font-size: 11px; text-transform: uppercase; color: #64748B; border-bottom: 1px solid #CBD5E1; }
            .summary { margin-left: auto; width: 250px; font-size: 13px; line-height: 2; }
            .summary-row { display: flex; justify-content: space-between; }
            .summary-total { font-weight: bold; font-size: 16px; color: #2563EB; border-top: 1px solid #E2E8F0; padding-top: 8px; margin-top: 8px; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #F1F5F9; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">INVOICE</div>
              <div style="font-size: 14px; font-weight: bold; margin-top: 4px; color: #475569;">Order #${orderData.number}</div>
            </div>
            <div class="meta">
              Date: ${(() => {
                if (!orderData.dateCreated) return 'Unknown';
                try {
                  const normalized = orderData.dateCreated.replace(' ', 'T');
                  const parsedDate = new Date(normalized);
                  return isNaN(parsedDate.getTime()) ? orderData.dateCreated : parsedDate.toLocaleDateString();
                } catch {
                  return orderData.dateCreated;
                }
              })()}<br/>
              Status: ${orderData.status.toUpperCase()}<br/>
              Gateway: ${orderData.paymentMethodTitle}
            </div>
          </div>

          <div class="grid">
            <div class="col">
              <div class="col-title">Billing Address</div>
              <strong>${billing.first_name || ''} ${billing.last_name || ''}</strong><br/>
              ${billing.address_1 || ''}<br/>
              ${billing.address_2 ? billing.address_2 + '<br/>' : ''}
              ${billing.city || ''}, ${billing.state || ''} ${billing.postcode || ''}<br/>
              ${billing.country || ''}<br/>
              T: ${billing.phone || 'N/A'}<br/>
              E: ${billing.email || 'N/A'}
            </div>
            <div class="col">
              <div class="col-title">Shipping Address</div>
              <strong>${shipping.first_name || ''} ${shipping.last_name || ''}</strong><br/>
              ${shipping.address_1 || ''}<br/>
              ${shipping.address_2 ? shipping.address_2 + '<br/>' : ''}
              ${shipping.city || ''}, ${shipping.state || ''} ${shipping.postcode || ''}<br/>
              ${shipping.country || ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50%;">Product Details</th>
                <th style="width: 10%; text-align: center;">Qty</th>
                <th style="width: 20%; text-align: right;">Unit Price</th>
                <th style="width: 20%; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-row">
              <span>Discounts:</span>
              <span>-$${Number(orderData.discountTotal).toFixed(2)}</span>
            </div>
            <div class="summary-row">
              <span>Shipping Fee:</span>
              <span>$${Number(orderData.shippingTotal).toFixed(2)}</span>
            </div>
            <div class="summary-row summary-total">
              <span>Net Total:</span>
              <span>$${Number(orderData.total).toFixed(2)}</span>
            </div>
          </div>

          <div class="footer">
            Thank you for shopping with us! Generated via WooPanda WooCommerce Mobile Manager.
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    try {
      const html = generateInvoiceHtml();
      await Print.printAsync({ html });
    } catch (err) {
      console.error('Print invoice failed:', err);
      Alert.alert('Error', 'Failed to print invoice.');
    }
  };

  const handleShare = async () => {
    try {
      const html = generateInvoiceHtml();
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice_Order_${orderData.number}` });
    } catch (err) {
      console.error('Share invoice failed:', err);
      Alert.alert('Error', 'Failed to share invoice.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing': return 'text-blue-400 bg-blue-500/10 border border-blue-500/20';
      case 'completed': return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
      case 'pending': return 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
      case 'cancelled': return 'text-red-400 bg-red-500/10 border border-red-500/20';
      default: return 'text-slate-600 bg-slate-100 border border-slate-200/50';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-grow px-5 pt-3" contentContainerStyle={{ paddingBottom: 50 }}>
        
        {/* Custom Premium Header Bar */}
        <View className="flex-row items-center justify-between mb-6">
          <Pressable 
            onPress={() => router.back()}
            className="w-10 h-10 bg-white border border-slate-200 rounded-xl items-center justify-center active:bg-slate-100"
          >
            <ArrowLeft size={18} color="#94A3B8" />
          </Pressable>
          <Text className="text-slate-900 font-extrabold text-base">Order Details</Text>
          <View className="w-10 h-10" />
        </View>

        {/* 1. Header Metadata card */}
        <View className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 shadow-lg">
          <View className="flex-row justify-between items-start mb-4">
            <View>
              <Text className="text-slate-900 font-extrabold text-lg">Order #{orderData.number}</Text>
              <Text className="text-slate-500 text-xs mt-1">
                Created: {new Date(orderData.dateCreated).toLocaleString()}
              </Text>
            </View>
            
            <Pressable 
              onPress={() => setStatusModalVisible(true)}
              className={`px-3 py-1.5 rounded-xl flex-row items-center gap-1.5 ${getStatusColor(orderData.status)}`}
            >
              <Text className="text-xs font-bold uppercase tracking-wider">{orderData.status}</Text>
              <ChevronDown size={14} />
            </Pressable>
          </View>

          {/* Invoice action keys */}
          <View className="flex-row gap-3 pt-4 border-t border-slate-200/60">
            <Pressable 
              onPress={handlePrint}
              className="flex-1 bg-slate-100/80 h-10 rounded-xl flex-row items-center justify-center gap-2 active:bg-slate-750"
            >
              <Printer size={14} color="#CBD5E1" />
              <Text className="text-slate-800 font-bold text-xs">Print PDF</Text>
            </Pressable>

            <Pressable 
              onPress={handleShare}
              className="flex-1 bg-slate-100/80 h-10 rounded-xl flex-row items-center justify-center gap-2 active:bg-slate-750"
            >
              <Share2 size={14} color="#CBD5E1" />
              <Text className="text-slate-800 font-bold text-xs">Share Invoice</Text>
            </Pressable>
          </View>
        </View>

        {/* 2. Customer Contact Card */}
        <View className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 shadow-lg">
          <Text className="text-slate-900 font-bold text-sm mb-3">Customer Contact</Text>
          <Text className="text-slate-800 font-bold text-sm mb-1">
            {billing?.first_name || ''} {billing?.last_name || 'Guest User'}
          </Text>
          <Text className="text-slate-500 text-xs mb-4">{billing?.email || 'No email profile'}</Text>
          
          {/* Contact Bar */}
          <View className="flex-row gap-3">
            <Pressable 
              onPress={handleCall}
              className="flex-1 bg-slate-150 h-11 rounded-xl items-center justify-center border border-slate-200/60 active:bg-slate-100"
            >
              <Phone size={18} color="#3B82F6" />
            </Pressable>

            <Pressable 
              onPress={handleWhatsApp}
              className="flex-1 bg-slate-150 h-11 rounded-xl items-center justify-center border border-slate-200/60 active:bg-slate-100"
            >
              <MessageSquare size={18} color="#10B981" />
            </Pressable>

            <Pressable 
              onPress={handleEmail}
              className="flex-1 bg-slate-150 h-11 rounded-xl items-center justify-center border border-slate-200/60 active:bg-slate-100"
            >
              <Mail size={18} color="#F59E0B" />
            </Pressable>
          </View>
        </View>

        {/* 3. Address Maps Panel */}
        <View className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 shadow-lg gap-4">
          
          {/* Shipping Address Panel */}
          <View>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-slate-600 font-bold text-xs uppercase tracking-wider">Shipping Address</Text>
              <View className="flex-row gap-3">
                <Pressable onPress={() => handleCopyAddress('shipping')} className="p-1 active:opacity-50">
                  <Copy size={13} color="#94A3B8" />
                </Pressable>
                <Pressable onPress={handleNavigate} className="p-1 active:opacity-50">
                  <MapPin size={13} color="#3B82F6" />
                </Pressable>
              </View>
            </View>
            <Text className="text-slate-700 text-xs leading-relaxed">
              {`${shipping?.first_name || ''} ${shipping?.last_name || ''}\n`}
              {`${shipping?.address_1 || ''} ${shipping?.address_2 || ''}\n`}
              {`${shipping?.city || ''}, ${shipping?.state || ''} ${shipping?.postcode || ''}\n`}
              {shipping?.country || ''}
            </Text>
          </View>

          {/* Billing Address Panel */}
          <View className="border-t border-slate-200 pt-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-slate-600 font-bold text-xs uppercase tracking-wider">Billing Address</Text>
              <Pressable onPress={() => handleCopyAddress('billing')} className="p-1 active:opacity-50">
                <Copy size={13} color="#94A3B8" />
              </Pressable>
            </View>
            <Text className="text-slate-700 text-xs leading-relaxed">
              {`${billing?.first_name || ''} ${billing?.last_name || ''}\n`}
              {`${billing?.address_1 || ''} ${billing?.address_2 || ''}\n`}
              {`${billing?.city || ''}, ${billing?.state || ''} ${billing?.postcode || ''}\n`}
              {billing?.country || ''}
            </Text>
          </View>

        </View>

        {/* 4. Products Table Card */}
        <View className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 shadow-lg">
          <View className="flex-row items-center gap-2 mb-4">
            <ShoppingBag size={16} color="#60A5FA" />
            <Text className="text-slate-900 font-bold text-sm">Ordered Products</Text>
          </View>
          
          <View className="divide-y divide-slate-200 mb-4">
            {lineItems.map((item: any) => (
              <View key={item.id} className="py-3 flex-row justify-between items-center">
                <View className="flex-1 pr-4">
                  <Text className="text-slate-800 font-bold text-xs" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-slate-500 text-[10px] mt-1 font-semibold">
                    Price: {getCurrencySymbol(orderData.currency)}{Number(item.price).toFixed(2)}  x {item.quantity}
                  </Text>
                </View>
                <Text className="text-slate-800 font-extrabold text-xs">
                  {getCurrencySymbol(orderData.currency)}{Number(item.total).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>

          {/* Prices list summary */}
          <View className="border-t border-slate-200 pt-4 gap-2">
            
            <View className="flex-row justify-between">
              <Text className="text-slate-500 text-xs">Discounts</Text>
              <Text className="text-slate-700 text-xs">-{getCurrencySymbol(orderData.currency)}{Number(orderData.discountTotal).toFixed(2)}</Text>
            </View>
            
            <View className="flex-row justify-between">
              <Text className="text-slate-500 text-xs">Shipping Fee</Text>
              <Text className="text-slate-700 text-xs">{getCurrencySymbol(orderData.currency)}{Number(orderData.shippingTotal).toFixed(2)}</Text>
            </View>

            <View className="flex-row justify-between border-t border-slate-200 pt-3 mt-1">
              <Text className="text-slate-900 font-bold text-sm">Net Total</Text>
              <Text className="text-blue-400 font-extrabold text-base">
                {getCurrencySymbol(orderData.currency)}{Number(orderData.total).toFixed(2)}
              </Text>
            </View>

          </View>
        </View>

        {/* 5. Payment details card */}
        <View className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 shadow-lg flex-row items-center gap-3">
          <CreditCard size={18} color="#94A3B8" />
          <View className="flex-1">
            <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Payment Method</Text>
            <Text className="text-slate-800 text-xs font-bold mt-0.5">{orderData.paymentMethodTitle}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Status Picker Modal */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-slate-900/40">
          <View className="bg-white border-t border-slate-200 rounded-t-3xl p-6">
            <Text className="text-slate-900 font-bold text-base mb-4 text-center">Change Order Status</Text>
            
            <View className="gap-2.5">
              {ALL_STATUSES.map((statusItem) => (
                <Pressable
                  key={statusItem}
                  onPress={() => handleStatusChange(statusItem)}
                  className={`h-11 rounded-xl items-center justify-center border ${
                    orderData.status === statusItem 
                      ? 'bg-blue-500/10 border-blue-500' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-extrabold uppercase ${
                    orderData.status === statusItem ? 'text-blue-400' : 'text-slate-600'
                  }`}>
                    {statusItem}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setStatusModalVisible(false)}
              className="bg-slate-100 h-11 rounded-xl items-center justify-center mt-5 active:bg-slate-750"
            >
              <Text className="text-slate-700 font-bold text-sm">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
