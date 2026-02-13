export const exportSubscriptionsToExcel = (restaurants, plans, filename = "subscription_list") => {
    const getPlanName = (planId) => {
        if (!planId) return 'No Plan';
        const plan = plans.find(p => p._id === planId);
        return plan ? plan.name : planId.replace(/_/g, ' ');
    };

    const headers = [
        "Restaurant Name",
        "Email",
        "Current Plan",
        "Status",
        "Start Date",
        "End Date",
        "Transaction ID",
        "Order ID"
    ];

    const rows = restaurants.map((restaurant) => [
        restaurant.name || "N/A",
        restaurant.email || restaurant.ownerEmail || "N/A",
        getPlanName(restaurant.subscription?.planId),
        restaurant.subscription?.status ? restaurant.subscription.status.toUpperCase() : "INACTIVE",
        restaurant.subscription?.startDate ? new Date(restaurant.subscription.startDate).toLocaleDateString() : "N/A",
        restaurant.subscription?.endDate ? new Date(restaurant.subscription.endDate).toLocaleDateString() : "N/A",
        restaurant.subscription?.paymentId || "N/A",
        restaurant.subscription?.orderId || "N/A"
    ]);

    // Create CSV content with tab delimiter for Excel compatibility
    const csvContent = [
        headers.join("\t"),
        ...rows.map(row => row.join("\t"))
    ].join("\n");

    // Use Blob with UTF-8 BOM
    const blob = new Blob(["\uFEFF" + csvContent], { type: "application/vnd.ms-excel;charset=utf-8;" });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportSubscriptionsToPDF = (restaurants, plans, filename = "subscription_list") => {
    const getPlanName = (planId) => {
        if (!planId) return 'No Plan';
        const plan = plans.find(p => p._id === planId);
        return plan ? plan.name : planId.replace(/_/g, ' ');
    };

    const headers = [
        "Restaurant",
        "Email",
        "Plan",
        "Status",
        "Start Date",
        "End Date",
        "Transaction ID"
    ];

    const rows = restaurants.map((restaurant) => [
        restaurant.name || "N/A",
        restaurant.email || restaurant.ownerEmail || "N/A",
        getPlanName(restaurant.subscription?.planId),
        restaurant.subscription?.status ? restaurant.subscription.status.toUpperCase() : "INACTIVE",
        restaurant.subscription?.startDate ? new Date(restaurant.subscription.startDate).toLocaleDateString() : "N/A",
        restaurant.subscription?.endDate ? new Date(restaurant.subscription.endDate).toLocaleDateString() : "N/A",
        restaurant.subscription?.paymentId || "N/A"
    ]);

    const printWindow = window.open("", "_blank");
    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
            margin: 0;
          }
          h1 { 
            text-align: center; 
            color: #1e293b;
            margin-bottom: 10px;
          }
          p { 
            text-align: center; 
            color: #64748b;
            margin-bottom: 20px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px; 
            font-size: 10px;
          }
          th, td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left; 
          }
          th { 
            background-color: #3b82f6; 
            color: white; 
            font-weight: bold; 
          }
          tr:nth-child(even) { 
            background-color: #f9fafb; 
          }
          tr:hover { 
            background-color: #f1f5f9; 
          }
          @media print { 
            body { 
              margin: 0; 
              padding: 10px;
            }
            @page {
              margin: 1cm;
              size: landscape;
            }
          }
        </style>
      </head>
      <body>
        <h1>Subscription List</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${row.map(cell => `<td>${cell}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(() => window.close(), 100);
          }
        </script>
      </body>
    </html>
  `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
};
