# 128H100-RoCE

128 台 H100 AIDC 单项目 · RoCEv2（RDMA over Converged Ethernet）。
拓扑：4 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF + 2 BIZ_AGG + 4 BIZ_ACCESS
      + 1 OOB_AGG + 2 OOB_ACCESS = 24 台；四表格多 sheet，四网合一。
可调参数：PFC队列/CNP队列（0-7）。RoCE 收敛比 3:1。
